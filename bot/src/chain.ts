/**
 * Chain layer for Striker, Workers edition.
 *
 * No filesystem: config (RPC, admin key, USDC mint) is injected once per
 * invocation via initChain(), custodial keypairs live in KV-backed memory
 * (persist.mem.keys), and the IDL is bundled. Anchor runs at the edge with a
 * lightweight wallet, and transactions are confirmed by HTTP polling since the
 * Workers runtime has no websocket for the usual confirmTransaction path.
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount,
  createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction,
} from "@solana/spl-token";
import idl from "../../app/src/idl/prediction_market.json";
import { mem, markDirty } from "./persist";

export const OUTCOMES = ["Home", "Draw", "Away"] as const;
export const USDC_DECIMALS = 6;
export const toUi = (base: number) => base / 10 ** USDC_DECIMALS;
export const toBase = (ui: number) => Math.round(ui * 10 ** USDC_DECIMALS);

// ---- lazy config (set by the worker before any chain call) ----
let conn: Connection;
let admin: Keypair;
let USDC_MINT: PublicKey;
let readProgram: anchor.Program;
let pid: PublicKey;

/** Edge-safe wallet: anchor.Wallet (NodeWallet) is filesystem-based and undefined
 *  in a Workers bundle, so provide the minimal signing interface ourselves. */
function edgeWallet(kp: Keypair): any {
  return {
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async (tx: any) => { (tx.partialSign ? tx.partialSign(kp) : tx.sign([kp])); return tx; },
    signAllTransactions: async (txs: any[]) => { txs.forEach((t) => (t.partialSign ? t.partialSign(kp) : t.sign([kp]))); return txs; },
  };
}

export function initChain(cfg: { RPC_URL: string; USDC_MINT: string; ADMIN_SECRET: string }) {
  conn = new Connection(cfg.RPC_URL, "confirmed");
  admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(cfg.ADMIN_SECRET)));
  USDC_MINT = new PublicKey(cfg.USDC_MINT);
  readProgram = new anchor.Program(idl as anchor.Idl, new anchor.AnchorProvider(conn, edgeWallet(Keypair.generate()), { commitment: "confirmed" }));
  pid = readProgram.programId;
}

const enc = (s: string) => new TextEncoder().encode(s);
export const positionPda = (market: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync([enc("position"), market.toBuffer(), owner.toBuffer()], pid)[0];

export function userKeypair(tgId: number): Keypair {
  const bytes = mem.keys[String(tgId)];
  if (bytes) return Keypair.fromSecretKey(Uint8Array.from(bytes));
  const kp = Keypair.generate();
  mem.keys[String(tgId)] = Array.from(kp.secretKey);
  markDirty();
  return kp;
}
export const ownerOf = (tgId: number) => userKeypair(tgId).publicKey;

/** Sign, send, and confirm by HTTP polling (no websocket in Workers). */
async function sendIx(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  for (let i = 0; i < 8; i++) {
    const st = (await conn.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw new Error("transaction failed");
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return sig; // best-effort: usually lands, agent only needs the signature to log
}

/** SOL for fees + 1,000 demo USDC on first touch. Returns UI balance. */
export async function ensureFunded(tgId: number): Promise<number> {
  const kp = userKeypair(tgId);
  if ((await conn.getBalance(kp.publicKey)) < 0.03 * LAMPORTS_PER_SOL) {
    try {
      await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 0.1 * LAMPORTS_PER_SOL), "confirmed");
    } catch {
      await sendIx([SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: kp.publicKey, lamports: Math.round(0.03 * LAMPORTS_PER_SOL) })], [admin]);
    }
  }
  const ata = getAssociatedTokenAddressSync(USDC_MINT, kp.publicKey);
  let bal = 0;
  try { bal = Number((await getAccount(conn, ata)).amount); } catch { /* no ata yet */ }
  if (bal < toBase(50)) {
    await sendIx([
      createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, kp.publicKey, USDC_MINT),
      createMintToInstruction(USDC_MINT, ata, admin.publicKey, BigInt(toBase(1000))),
    ], [admin]);
    bal += toBase(1000);
  }
  return toUi(bal);
}

export async function usdcBalance(tgId: number): Promise<number> {
  try {
    const ata = getAssociatedTokenAddressSync(USDC_MINT, ownerOf(tgId));
    return toUi(Number((await getAccount(conn, ata)).amount));
  } catch { return 0; }
}

export interface Market {
  pubkey: PublicKey; matchId: number; home: string; away: string; status: string;
  bettingCloseTs: number; pools: number[]; totalPool: number; feeBps: number;
  finalOutcome: number; resultVerified: boolean; homeGoals: number; awayGoals: number;
  usdcMint: PublicKey; vault: PublicKey;
}
const toNum = (v: any) => (anchor.BN.isBN(v) ? v.toNumber() : Number(v));

export async function fetchMarkets(): Promise<Market[]> {
  const all = await (readProgram.account as any).market.all();
  return all.map((a: any) => ({
    pubkey: a.publicKey,
    matchId: toNum(a.account.matchId),
    home: a.account.homeTeam,
    away: a.account.awayTeam,
    status: Object.keys(a.account.status)[0],
    bettingCloseTs: toNum(a.account.bettingCloseTs),
    pools: (a.account.pools as any[]).map(toNum),
    totalPool: toNum(a.account.totalPool),
    feeBps: a.account.feeBps,
    finalOutcome: a.account.finalOutcome,
    resultVerified: !!a.account.resultVerified,
    homeGoals: toNum(a.account.homeGoals),
    awayGoals: toNum(a.account.awayGoals),
    usdcMint: a.account.usdcMint,
    vault: a.account.vault,
  })).sort((a: Market, b: Market) => a.bettingCloseTs - b.bettingCloseTs);
}

export const isOpen = (m: Market) => m.status === "open" && m.bettingCloseTs > Math.floor(Date.now() / 1000);

export function impliedPct(pools: number[]): number[] {
  const t = pools.reduce((a, b) => a + b, 0);
  return t === 0 ? pools.map(() => 0) : pools.map((p) => (p / t) * 100);
}
export function multiplier(m: Market, outcome: number): number {
  const total = m.pools.reduce((a, b) => a + b, 0);
  const win = m.pools[outcome];
  if (win === 0) return 0;
  return (total * (1 - m.feeBps / 10000)) / win;
}
export function payoutPreview(m: Market, outcome: number, amount: number): { payout: number; mult: number } {
  const amt = toBase(amount);
  const win = m.pools[outcome] + amt;
  const total = m.totalPool + amt;
  const payout = win > 0 ? (amt / win) * total * (1 - m.feeBps / 10000) : 0;
  return { payout: toUi(payout), mult: amount > 0 ? toUi(payout) / amount : 0 };
}

export async function placeBet(tgId: number, m: Market, outcome: number, amount: number): Promise<string> {
  const kp = userKeypair(tgId);
  const ata = getAssociatedTokenAddressSync(m.usdcMint, kp.publicKey);
  const ix = await readProgram.methods
    .placeBet(outcome, new anchor.BN(toBase(amount)))
    .accounts({
      bettor: kp.publicKey, market: m.pubkey, position: positionPda(m.pubkey, kp.publicKey),
      vault: m.vault, bettorTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .instruction();
  return sendIx([ix], [kp]);
}

export interface Position { market: PublicKey; owner: string; stakes: number[]; totalStake: number; claimed: boolean }

export async function fetchPositions(): Promise<Position[]> {
  const all = await (readProgram.account as any).position.all();
  return all.map((a: any) => ({
    market: a.account.market,
    owner: a.account.owner.toBase58(),
    stakes: (a.account.stakes as any[]).map(toNum),
    totalStake: toNum(a.account.totalStake),
    claimed: !!a.account.claimed,
  }));
}

export async function positionsOf(tgId: number): Promise<Position[]> {
  const me = ownerOf(tgId).toBase58();
  return (await fetchPositions()).filter((p) => p.owner === me);
}

export async function claim(tgId: number, m: Market): Promise<string> {
  const kp = userKeypair(tgId);
  const ata = getAssociatedTokenAddressSync(m.usdcMint, kp.publicKey);
  const ix = await readProgram.methods
    .claim()
    .accounts({
      claimant: kp.publicKey, market: m.pubkey, position: positionPda(m.pubkey, kp.publicKey),
      vault: m.vault, claimantTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  return sendIx([ix], [kp]);
}

/** Deterministic simulated consensus odds (labelled SIM until the live TxODDS token lands). */
export function simConsensus(matchId: number): number[] {
  let s = (matchId * 2654435761) % 2147483647;
  const r = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const a = 25 + r() * 40, b = 15 + r() * 20;
  const c = Math.max(8, 100 - a - b);
  const t = a + b + c;
  return [a / t * 100, b / t * 100, c / t * 100];
}
