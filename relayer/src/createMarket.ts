/**
 * Admin tool: create on-chain markets for upcoming TxODDS fixtures.
 *
 * Usage:
 *   ts-node src/createMarket.ts            # create markets for all fixtures
 *   ts-node src/createMarket.ts 9001 9002  # only these match ids
 *
 * Requires USDC_MINT and TREASURY_TOKEN_ACCOUNT in .env. The oracle/dispute keys
 * are taken from ORACLE_KEYPAIR (oracle) and the admin signer (dispute authority),
 * adjust here if you want distinct watcher keys.
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { config, loadKeypair } from "./config";
import { buildCtx, marketPda, vaultPda } from "./program";
import { makeTxOddsClient } from "./txodds";

async function main() {
  if (!config.usdcMint || !config.treasuryTokenAccount) {
    throw new Error("Set USDC_MINT and TREASURY_TOKEN_ACCOUNT in .env first.");
  }
  const admin = loadKeypair(config.adminKeypairPath);
  const oracle = loadKeypair(config.oracleKeypairPath);
  const ctx = buildCtx(admin);

  const usdcMint = new PublicKey(config.usdcMint);
  const treasury = new PublicKey(config.treasuryTokenAccount);

  const only = process.argv.slice(2).map(Number);
  const tx = makeTxOddsClient();
  const fixtures = (await tx.listFixtures()).filter(
    (f) => only.length === 0 || only.includes(f.matchId)
  );

  for (const fx of fixtures) {
    const market = marketPda(fx.matchId);
    const existing = await (ctx.program.account as any).market.fetchNullable(market);
    if (existing) {
      console.log(`skip ${fx.matchId}: market already exists`);
      continue;
    }
    const sig = await ctx.program.methods
      .initializeMarket(
        new BN(fx.matchId),
        new BN(fx.kickoffTs),
        new BN(config.defaultDisputeWindow),
        config.defaultFeeBps,
        oracle.publicKey,
        admin.publicKey, // dispute authority (swap for a dedicated watcher key in prod)
        fx.homeTeam.slice(0, 48),
        fx.awayTeam.slice(0, 48)
      )
      .accounts({
        authority: admin.publicKey,
        market,
        usdcMint,
        vault: vaultPda(market),
        treasury,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log(`created market ${fx.matchId} (${fx.homeTeam} v ${fx.awayTeam}): ${sig}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
