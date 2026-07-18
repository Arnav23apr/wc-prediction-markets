import { PublicKey } from "@solana/web3.js";
import { BN, Program, Idl } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { getConnection } from "./program";

export const USDC_DECIMALS = 6;
export const OUTCOMES = ["Home", "Draw", "Away"] as const;

export type StatusKey = "open" | "resultProposed" | "disputed" | "settled" | "voided";

export interface MarketData {
  pubkey: PublicKey;
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  usdcMint: PublicKey;
  vault: PublicKey;
  treasury: PublicKey;
  status: StatusKey;
  bettingCloseTs: number;
  disputeWindow: number;
  resultCommitTs: number;
  pools: number[]; // base units
  totalPool: number;
  feeBps: number;
  proposedOutcome: number;
  finalOutcome: number;
  payoutPool: number;
  winningPool: number;
  numBettors: number;
  resultVerified: boolean;
  homeGoals: number;
  awayGoals: number;
}

const toNum = (v: any) => (BN.isBN(v) ? (v as BN).toNumber() : Number(v));

function decode(pubkey: PublicKey, acc: any): MarketData {
  return {
    pubkey,
    matchId: toNum(acc.matchId),
    homeTeam: acc.homeTeam,
    awayTeam: acc.awayTeam,
    usdcMint: acc.usdcMint,
    vault: acc.vault,
    treasury: acc.treasury,
    status: Object.keys(acc.status)[0] as StatusKey,
    bettingCloseTs: toNum(acc.bettingCloseTs),
    disputeWindow: toNum(acc.disputeWindow),
    resultCommitTs: toNum(acc.resultCommitTs),
    pools: (acc.pools as any[]).map(toNum),
    totalPool: toNum(acc.totalPool),
    feeBps: acc.feeBps,
    proposedOutcome: acc.proposedOutcome,
    finalOutcome: acc.finalOutcome,
    payoutPool: toNum(acc.payoutPool),
    winningPool: toNum(acc.winningPool),
    numBettors: acc.numBettors,
    resultVerified: !!acc.resultVerified,
    homeGoals: toNum(acc.homeGoals),
    awayGoals: toNum(acc.awayGoals),
  };
}

export async function fetchMarkets(program: Program<Idl>): Promise<MarketData[]> {
  const accounts = await (program.account as any).market.all();
  const all: MarketData[] = accounts
    .map((a: any) => decode(a.publicKey, a.account))
    .sort((a: MarketData, b: MarketData) => a.bettingCloseTs - b.bettingCloseTs);
  // Hide empty orphans when a funded market exists for the same fixture pair
  // (aborted seeding runs on shared clusters leave zero-pool duplicates).
  const funded = new Set(all.filter((m) => m.totalPool > 0).map((m) => `${m.homeTeam}|${m.awayTeam}`));
  return all.filter((m) => m.totalPool > 0 || !funded.has(`${m.homeTeam}|${m.awayTeam}`));
}

export async function fetchMarket(program: Program<Idl>, pubkey: PublicKey): Promise<MarketData> {
  const acc = await (program.account as any).market.fetch(pubkey);
  return decode(pubkey, acc);
}

// --- display helpers ---
export const toUi = (base: number) => base / 10 ** USDC_DECIMALS;
export const toBase = (ui: number) => Math.round(ui * 10 ** USDC_DECIMALS);

/** Implied probability per outcome from pool share (parimutuel). */
export function impliedPct(pools: number[]): number[] {
  const total = pools.reduce((a, b) => a + b, 0);
  if (total === 0) return pools.map(() => 0);
  return pools.map((p) => (p / total) * 100);
}

/** Decimal-style payout multiplier for a 1-unit stake on `idx`, after fee. */
export function payoutMultiplier(pools: number[], idx: number, feeBps: number): number {
  const total = pools.reduce((a, b) => a + b, 0);
  const win = pools[idx];
  if (win === 0) return 0;
  const payoutPool = total * (1 - feeBps / 10_000);
  return payoutPool / win;
}

export function statusLabel(s: StatusKey): string {
  switch (s) {
    case "open": return "Open";
    case "resultProposed": return "Result proposed";
    case "disputed": return "Disputed";
    case "settled": return "Settled";
    case "voided": return "Voided";
  }
}

/**
 * The one state machine every chip must agree with. On-chain `status` stays
 * "open" after the betting window closes (until a result is proposed), so any
 * UI reading `status` alone will say Open on a market nobody can bet — derive
 * the user-facing phase from status + clock instead.
 */
export type MarketPhase = StatusKey | "locked";
export function marketPhase(m: { status: StatusKey; bettingCloseTs: number }): MarketPhase {
  if (m.status === "open" && Math.floor(Date.now() / 1000) >= m.bettingCloseTs) return "locked";
  return m.status;
}
export function phaseLabel(p: MarketPhase): string {
  return p === "locked" ? "Locked" : statusLabel(p);
}

export function outcomeLabel(code: number): string {
  if (code === 255) return "Void";
  if (code === 254) return "–";
  return OUTCOMES[code] ?? "?";
}

const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
export const shortHash = (h: string) => (h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);

export interface RegistryView {
  root: string; // hex
  updatedAt: number;
  isSet: boolean;
}

/** Read the TxLINE score-root registry (the on-chain root proofs verify against). */
export async function fetchRootRegistry(program: Program<Idl>): Promise<RegistryView | null> {
  try {
    const [pda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("root_registry")],
      program.programId
    );
    const acc = await (program.account as any).rootRegistry.fetchNullable(pda);
    if (!acc) return null;
    const root = hex(Array.from(acc.root as number[]));
    return { root, updatedAt: toNum(acc.updatedAt), isSet: /[^0]/.test(root) };
  } catch {
    return null;
  }
}

/** Connected wallet's test-USDC balance (UI units). */
export async function fetchUsdcBalance(owner: PublicKey, mint: PublicKey): Promise<number | null> {
  try {
    const ata = getAssociatedTokenAddressSync(mint, owner);
    const acc = await getAccount(getConnection(), ata);
    return Number(acc.amount) / 10 ** USDC_DECIMALS;
  } catch {
    return null;
  }
}
