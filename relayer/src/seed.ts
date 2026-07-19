/**
 * Seed a few OPEN markets (with bets, so pools/odds render) against a running
 * local validator — for viewing the UI.
 *
 *   RPC_URL=http://127.0.0.1:8899 PROGRAM_ID=<id> npx ts-node src/seed.ts
 *   (npm run seed)
 *
 * Prints the test USDC mint to paste into app/.env.local (NEXT_PUBLIC_USDC_MINT).
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import { buildCtx, marketPda, vaultPda, positionPda } from "./program";
import { config, loadOrCreateKeypair } from "./config";

const ADMIN_PATH = ".demo-admin.json";
const MINT_PATH = ".demo-mint.txt";

const HOME = 0, DRAW = 1, AWAY = 2;
const OFFSET = Number(process.env.MATCH_OFFSET ?? 0);
const pace = (ms = 1600) => new Promise((r) => setTimeout(r, ms));
const usdc = (n: number) => new BN(Math.round(n * 1e6));
const airdrop = async (c: Connection, pk: PublicKey, sol: number, from?: Keypair) => {
  // Devnet faucet rate-limits hard; fall back to transferring from the (pre-funded)
  // admin keypair. Local validator always airdrops fine.
  try {
    await c.confirmTransaction(await c.requestAirdrop(pk, sol * LAMPORTS_PER_SOL), "confirmed");
  } catch (e) {
    if (!from || from.publicKey.equals(pk)) throw e;
    const { SystemProgram, Transaction, sendAndConfirmTransaction } = await import("@solana/web3.js");
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: pk, lamports: Math.round(sol * LAMPORTS_PER_SOL) })
    );
    await sendAndConfirmTransaction(c, tx, [from]);
  }
};

async function main() {
  const admin = loadOrCreateKeypair(ADMIN_PATH); // persisted so mint-to keeps authority
  const ctx = buildCtx(admin);
  const conn = ctx.connection;
  const program = ctx.program as any;
  try { await airdrop(conn, admin.publicKey, 20); } catch { /* pre-funded on devnet */ }
  console.log("admin", admin.publicKey.toBase58(), "balance", (await conn.getBalance(admin.publicKey)) / LAMPORTS_PER_SOL, "SOL");

  let mint: PublicKey;
  if (process.env.REUSE_MINT === "1" && fs.existsSync(MINT_PATH)) {
    mint = new PublicKey(fs.readFileSync(MINT_PATH, "utf8").trim());
    console.log("reusing mint", mint.toBase58());
  } else {
    mint = await createMint(conn, admin, admin.publicKey, null, 6);
    fs.writeFileSync(MINT_PATH, mint.toBase58());
  }
  const treasury = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, admin.publicKey)).address;
  const oracle = Keypair.generate();

  const fund = async (give: number) => {
    await pace();
    const kp = Keypair.generate();
    await airdrop(conn, kp.publicKey, 0.03, admin);
    const ata = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, kp.publicKey)).address;
    await mintTo(conn, admin, mint, ata, admin, BigInt(usdc(give).toString()));
    return { kp, ata };
  };
  // Four well-funded bettors, reused across the slate, so pools and bettor
  // counts vary per market without airdropping a fresh wallet each time.
  // Funded SEQUENTIALLY (not Promise.all) so the public devnet RPC's per-call
  // rate limit isn't saturated by a concurrent burst.
  const NBETTORS = 3;
  const bettors: { kp: Keypair; ata: PublicKey }[] = [];
  for (let i = 0; i < NBETTORS; i++) {
    bettors.push(await fund(40000));
    console.log(`  funded bettor ${i + 1}/${NBETTORS}`);
    await pace(1500);
  }

  /** Seed one market. `days` sets the close window (fractional ok) so the
   *  "Closing soon" sort has real spread across the tournament. `who` picks
   *  which bettor wallets take each bet, driving distinct bettor counts. */
  const seed = async (
    matchId: number,
    home: string,
    away: string,
    bets: [number, number][],
    days = 8,
    who?: number[]
  ) => {
    const market = marketPda(matchId);
    if (await conn.getAccountInfo(market)) { console.log(`  ${home} vs ${away} already seeded, skipping`); return; }
    const vault = vaultPda(market);
    const mktClose = new BN(Math.floor(Date.now() / 1000) + Math.round(days * 24 * 3600));
    await program.methods
      .initializeMarket(new BN(matchId), mktClose, new BN(3600), 200, oracle.publicKey, admin.publicKey, home, away)
      .accounts({ authority: admin.publicKey, market, usdcMint: mint, vault, treasury, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    for (let i = 0; i < bets.length; i++) {
      const [outcome, amount] = bets[i];
      const { kp, ata } = bettors[(who ? who[i % who.length] : i) % bettors.length];
      await program.methods
        .placeBet(outcome, usdc(amount))
        .accounts({ bettor: kp.publicKey, market, position: positionPda(market, kp.publicKey), vault, bettorTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([kp]).rpc();
    }
    console.log(`  seeded ${home} vs ${away} (closes ~${days}d, ${bets.length} bets)`);
  };

  // Whole-tournament slate: original marquee three plus a broad group/knockout
  // spread, with varied pools, bettor counts, and close windows so the board
  // reads like a live World Cup, not a demo of three.
  type Fx = { id: number; home: string; away: string; bets: [number, number][]; days?: number; who?: number[] };
  const FIXTURES: Fx[] = [
    { id: 9101, home: "Argentina", away: "France", bets: [[HOME, 500], [AWAY, 200], [DRAW, 100]] },
    { id: 9102, home: "Brazil", away: "England", bets: [[HOME, 300], [AWAY, 300]] },
    { id: 9103, home: "Spain", away: "Germany", bets: [[AWAY, 400], [HOME, 150], [DRAW, 50]] },
    { id: 9201, home: "Portugal", away: "Netherlands", bets: [[HOME, 600], [AWAY, 450], [DRAW, 200]], days: 0.03, who: [0, 1, 2] },
    { id: 9202, home: "Belgium", away: "Croatia", bets: [[HOME, 300], [DRAW, 250], [AWAY, 150]], days: 0.08, who: [3, 4, 0] },
    { id: 9203, home: "United States", away: "Mexico", bets: [[HOME, 400], [AWAY, 520]], days: 12, who: [1, 5] },
    { id: 9205, home: "Japan", away: "Australia", bets: [[HOME, 500], [DRAW, 140]], days: 6, who: [0, 2] },
    { id: 9206, home: "Italy", away: "Switzerland", bets: [[HOME, 700], [AWAY, 300], [DRAW, 220]], days: 14, who: [1, 2, 0] },
    { id: 9210, home: "Serbia", away: "Ghana", bets: [[HOME, 240], [AWAY, 210], [DRAW, 150]], days: 0.06, who: [2, 0, 1] },
    { id: 9211, home: "Nigeria", away: "Cameroon", bets: [[HOME, 330], [DRAW, 170], [AWAY, 200]], days: 11, who: [2, 1, 0] },
    { id: 9212, home: "Qatar", away: "Egypt", bets: [[AWAY, 420], [HOME, 110], [DRAW, 90]], days: 15, who: [0, 1, 2] },
    { id: 9214, home: "Brazil", away: "Argentina", bets: [[HOME, 900], [AWAY, 700], [DRAW, 300]], days: 18, who: [0, 1, 2] },
  ];

  console.log(`seeding ${FIXTURES.length} markets...`);
  for (const f of FIXTURES) {
    await pace(1200);
    try {
      await seed(f.id + OFFSET, f.home, f.away, f.bets, f.days ?? 8, f.who);
    } catch (e: any) {
      console.log(`  ! ${f.home} v ${f.away} failed: ${e.message?.slice(0, 120)} (continuing)`);
    }
  }

  console.log(`\nDone. Put this in app/.env.local:`);
  console.log(`NEXT_PUBLIC_RPC_URL=${config.rpcUrl}`);
  console.log(`NEXT_PUBLIC_USDC_MINT=${mint.toBase58()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
