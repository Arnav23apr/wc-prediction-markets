/**
 * Chain layer for Striker: custodial keypairs per Telegram user, demo-USDC
 * faucet, market reads and bet/claim writes against the prediction-market
 * program. Demo custody on a local cluster; a production build would use
 * session keys or wallet-connect deep links instead.
 */
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount,
  createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction,
} from "@solana/spl-token";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8990";
const KEYS_DIR = path.resolve(__dirname, "../.keys");
const IDL_PATH = path.resolve(__dirname, "../../app/src/idl/prediction_market.json");
const DEMO_ADMIN = path.resolve(__dirname, "../../relayer/.demo-admin.json");
const DEMO_MINT = path.resolve(__dirname, "../../relayer/.demo-mint.txt");

export const OUTCOMES = ["Home", "Draw", "Away"] as const;
export const USDC_DECIMALS = 6;
export const toUi = (base: number) => base / 10 ** USDC_DECIMALS;
export const toBase = (ui: number) => Math.round(ui * 10 ** USDC_DECIMALS);

const conn = new Connection(RPC, "confirmed");
const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });

const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(DEMO_ADMIN, "utf8"))));
const USDC_MINT = new PublicKey(fs.readFileSync(DEMO_MINT, "utf8").trim());

function programFor(kp: Keypair): anchor.Program {
  return new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: "confirmed" }));
}
const readProgram = programFor(Keypair.generate());
const pid = readProgram.programId;

const enc = (s: string) => Buffer.from(s);
export const positionPda = (market: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync([enc("position"), market.toBuffer(), owner.toBuffer()], pid)[0];

export function userKeypair(tgId: number): Keypair {
  const p = path.join(KEYS_DIR, `${tgId}.json`);
  if (fs.existsSync(p)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
  const kp = Keypair.generate();
  fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}
export const ownerOf = (tgId: number) => userKeypair(tgId).publicKey;

/** SOL for fees + 1,000 demo USDC on first touch. Returns UI balance. */
export async function ensureFunded(tgId: number): Promise<number> {
  const kp = userKeypair(tgId);
  if ((await conn.getBalance(kp.publicKey)) < 0.05 * LAMPORTS_PER_SOL) {
    // devnet faucet rate-limits; fall back to a transfer from the demo admin
    try {
      await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 0.2 * LAMPORTS_PER_SOL), "confirmed");
    } catch {
      const { Transaction, sendAndConfirmTransaction } = await import("@solana/web3.js");
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: kp.publicKey, lamports: Math.round(0.05 * LAMPORTS_PER_SOL) })
      );
      await sendAndConfirmTransaction(conn, tx, [admin]);
    }
  }
  const ata = getAssociatedTokenAddressSync(USDC_MINT, kp.publicKey);
  let bal = 0;
  try { bal = Number((await getAccount(conn, ata)).amount); } catch { /* no ata yet */ }
  if (bal < toBase(50)) {
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, kp.publicKey, USDC_MINT),
      createMintToInstruction(USDC_MINT, ata, admin.publicKey, BigInt(toBase(1000)))
    );
    await anchor.web3.sendAndConfirmTransaction(conn, tx, [admin]);
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
  pubkey: PublicKey;
  matchId: number;
  home: string;
  away: string;
  status: string;
  bettingCloseTs: number;
  pools: number[];
  totalPool: number;
  feeBps: number;
  finalOutcome: number;
  resultVerified: boolean;
  homeGoals: number;
  awayGoals: number;
  usdcMint: PublicKey;
  vault: PublicKey;
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
/** What `amount` on `outcome` returns if it wins (after your own bet moves the pool). */
export function payoutPreview(m: Market, outcome: number, amount: number): { payout: number; mult: number } {
  const amt = toBase(amount);
  const win = m.pools[outcome] + amt;
  const total = m.totalPool + amt;
  const payout = win > 0 ? (amt / win) * total * (1 - m.feeBps / 10000) : 0;
  return { payout: toUi(payout), mult: amount > 0 ? toUi(payout) / amount : 0 };
}

export async function placeBet(tgId: number, m: Market, outcome: number, amount: number): Promise<string> {
  const kp = userKeypair(tgId);
  const program = programFor(kp);
  const ata = getAssociatedTokenAddressSync(m.usdcMint, kp.publicKey);
  return program.methods
    .placeBet(outcome, new anchor.BN(toBase(amount)))
    .accounts({
      bettor: kp.publicKey,
      market: m.pubkey,
      position: positionPda(m.pubkey, kp.publicKey),
      vault: m.vault,
      bettorTokenAccount: ata,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
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
  const program = programFor(kp);
  const ata = getAssociatedTokenAddressSync(m.usdcMint, kp.publicKey);
  return program.methods
    .claim()
    .accounts({
      claimant: kp.publicKey,
      market: m.pubkey,
      position: positionPda(m.pubkey, kp.publicKey),
      vault: m.vault,
      claimantTokenAccount: ata,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
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
