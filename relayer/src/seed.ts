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
  const closeTs = new BN(Math.floor(Date.now() / 1000) + Number(process.env.DAYS_OPEN ?? 1) * 24 * 3600);

  const fund = async (give: number) => {
    await pace();
    const kp = Keypair.generate();
    await airdrop(conn, kp.publicKey, 0.05, admin);
    const ata = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, kp.publicKey)).address;
    await mintTo(conn, admin, mint, ata, admin, BigInt(usdc(give).toString()));
    return { kp, ata };
  };
  const bettors = await Promise.all([fund(2000), fund(2000), fund(2000)]);

  const seed = async (matchId: number, home: string, away: string, bets: [number, number][]) => {
    const market = marketPda(matchId);
    if (await conn.getAccountInfo(market)) { console.log(`  ${home} vs ${away} already seeded, skipping`); return; }
    const vault = vaultPda(market);
    await program.methods
      .initializeMarket(new BN(matchId), closeTs, new BN(3600), 200, oracle.publicKey, admin.publicKey, home, away)
      .accounts({ authority: admin.publicKey, market, usdcMint: mint, vault, treasury, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    for (let i = 0; i < bets.length; i++) {
      const [outcome, amount] = bets[i];
      const { kp, ata } = bettors[i % bettors.length];
      await program.methods
        .placeBet(outcome, usdc(amount))
        .accounts({ bettor: kp.publicKey, market, position: positionPda(market, kp.publicKey), vault, bettorTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([kp]).rpc();
    }
    console.log(`  seeded ${home} vs ${away}`);
  };

  console.log("seeding markets...");
  await pace(1200); await seed(9101 + OFFSET, "Argentina", "France", [[HOME, 500], [AWAY, 200], [DRAW, 100]]);
  await pace(1200); await seed(9102 + OFFSET, "Brazil", "England", [[HOME, 300], [AWAY, 300]]);
  await pace(1200); await seed(9103 + OFFSET, "Spain", "Germany", [[AWAY, 400], [HOME, 150], [DRAW, 50]]);

  console.log(`\nDone. Put this in app/.env.local:`);
  console.log(`NEXT_PUBLIC_RPC_URL=${config.rpcUrl}`);
  console.log(`NEXT_PUBLIC_USDC_MINT=${mint.toBase58()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
