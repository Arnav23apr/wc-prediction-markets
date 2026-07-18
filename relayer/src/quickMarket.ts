/**
 * Create one fast-settling market (short betting window + a persistent oracle we
 * control) so you can bet in the UI and then watch it settle + claim. Pairs with
 * src/settle.ts.
 *
 *   RPC_URL=http://127.0.0.1:8899 PROGRAM_ID=<id> npx ts-node src/quickMarket.ts
 *   (npm run quick-market)
 */
import * as fs from "fs";
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { buildCtx, marketPda, vaultPda } from "./program";
import { loadKeypair, loadOrCreateKeypair } from "./config";

const MATCH_ID = Number(process.argv[2] ?? 9301);
const HOME = process.argv[3] ?? "Morocco";
const AWAY = process.argv[4] ?? "Portugal";
const CLOSE_SECS = Number(process.argv[5] ?? 150); // betting open for ~2.5 min

async function main() {
  if (!fs.existsSync(".demo-admin.json") || !fs.existsSync(".demo-mint.txt")) {
    throw new Error("run `npm run seed` first");
  }
  const admin = loadKeypair(".demo-admin.json");
  const mint = new PublicKey(fs.readFileSync(".demo-mint.txt", "utf-8").trim());
  const oracle = loadOrCreateKeypair(".demo-oracle.json"); // persisted so settle.ts can sign

  const ctx = buildCtx(admin);
  const program = ctx.program as any;
  await ctx.connection.confirmTransaction(
    await ctx.connection.requestAirdrop(oracle.publicKey, 2 * LAMPORTS_PER_SOL),
    "confirmed"
  );

  const market = marketPda(MATCH_ID);
  const treasury = (await program.account.market.fetchNullable(market))?.treasury;
  if (treasury) {
    console.log(`market ${MATCH_ID} already exists — bet on it, then: npm run settle -- ${MATCH_ID} 0`);
    return;
  }
  const treasuryAta = (await import("@solana/spl-token")).getAssociatedTokenAddressSync(mint, admin.publicKey);

  const closeTs = new BN(Math.floor(Date.now() / 1000) + CLOSE_SECS);
  await program.methods
    .initializeMarket(new BN(MATCH_ID), closeTs, new BN(5), 200, oracle.publicKey, admin.publicKey, HOME, AWAY)
    .accounts({ authority: admin.publicKey, market, usdcMint: mint, vault: vaultPda(market), treasury: treasuryAta, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();

  console.log(`\nCreated fast market: ${HOME} vs ${AWAY}  (match ${MATCH_ID})`);
  console.log(`Betting closes in ~${CLOSE_SECS}s, dispute window 5s.\n`);
  console.log(`NEXT: refresh the UI, bet on ${HOME} (Home), then run:`);
  console.log(`  npm run settle -- ${MATCH_ID} 0     # 0=Home wins`);
}

main().catch((e) => { console.error(e); process.exit(1); });
