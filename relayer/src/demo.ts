/**
 * End-to-end demo against a running local validator (scripts/localnet.sh).
 *
 * Exercises the FULL money flow on the deployed program with a real SPL mint:
 * create market -> three bets -> oracle commit -> finalize -> winners claim,
 * printing real on-chain USDC balances before/after. ~15s.
 *
 *   RPC_URL=http://127.0.0.1:8899 PROGRAM_ID=<id> npx ts-node src/demo.ts
 * (the npm script wires those in: `npm run demo`)
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { buildCtx, marketPda, vaultPda, positionPda } from "./program";
import { config } from "./config";

const HOME = 0, AWAY = 2;
const usdc = (n: number) => new BN(Math.round(n * 1e6));
const fmt = (base: number | bigint) => (Number(base) / 1e6).toLocaleString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function airdrop(conn: Connection, pk: PublicKey, sol: number) {
  const sig = await conn.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
}

async function main() {
  const admin = Keypair.generate();
  const ctx = buildCtx(admin);
  const conn = ctx.connection;
  const program = ctx.program as any;
  console.log(`\nRPC ${config.rpcUrl} | program ${config.programId.toBase58()}\n`);

  // --- infra: admin, mint, treasury, oracle ---
  await airdrop(conn, admin.publicKey, 10);
  const mint = await createMint(conn, admin, admin.publicKey, null, 6);
  const treasuryAcc = await getOrCreateAssociatedTokenAccount(conn, admin, mint, admin.publicKey);
  const treasury = treasuryAcc.address;
  const oracle = Keypair.generate();
  await airdrop(conn, oracle.publicKey, 1);
  console.log(`mint ${mint.toBase58()}`);

  // --- bettors funded with test USDC ---
  const mk = async (give: number) => {
    const kp = Keypair.generate();
    await airdrop(conn, kp.publicKey, 1);
    const ata = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, kp.publicKey)).address;
    await mintTo(conn, admin, mint, ata, admin, BigInt(usdc(give).toString()));
    return { kp, ata };
  };
  const A = await mk(1000), B = await mk(1000), C = await mk(1000);
  const bal = async (ata: PublicKey) => Number((await getAccount(conn, ata)).amount);

  // --- create market (short windows for a fast demo) ---
  const matchId = new BN(Date.now() % 1_000_000);
  const market = marketPda(BigInt(matchId.toString()));
  const vault = vaultPda(market);
  const closeTs = new BN(Math.floor(Date.now() / 1000) + 6);
  await program.methods
    .initializeMarket(matchId, closeTs, new BN(2), 200, oracle.publicKey, admin.publicKey, "Argentina", "France")
    .accounts({ authority: admin.publicKey, market, usdcMint: mint, vault, treasury, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  console.log(`\nMarket created: Argentina vs France  (fee 2%, dispute window 2s)`);

  // --- bets ---
  const bet = (who: Keypair, ata: PublicKey, outcome: number, amount: BN) =>
    program.methods
      .placeBet(outcome, amount)
      .accounts({
        bettor: who.publicKey, market, position: positionPda(market, who.publicKey),
        vault, bettorTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([who]).rpc();

  await bet(A.kp, A.ata, HOME, usdc(100));
  await bet(B.kp, B.ata, HOME, usdc(300));
  await bet(C.kp, C.ata, AWAY, usdc(200));
  console.log("Bets placed:  A=100 HOME   B=300 HOME   C=200 AWAY   (pool 600)\n");

  // --- settle: oracle commits HOME, then finalize after the dispute window ---
  console.log("waiting for betting to close...");
  await sleep(7000);
  await program.methods.commitResult(HOME).accounts({ market, oracle: oracle.publicKey }).signers([oracle]).rpc();
  console.log("oracle commit_result -> HOME (dispute window open)");
  await sleep(5500); // > 2s window, with margin for the integer-second on-chain clock
  await program.methods
    .finalizeResult()
    .accounts({ market, vault, treasury, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  console.log("finalize -> SETTLED\n");

  // --- claims ---
  const claim = (who: Keypair, ata: PublicKey) =>
    program.methods
      .claim()
      .accounts({ claimant: who.publicKey, market, position: positionPda(market, who.publicKey), vault, claimantTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([who]).rpc();

  const aBefore = await bal(A.ata), bBefore = await bal(B.ata);
  await claim(A.kp, A.ata);
  await claim(B.kp, B.ata);

  const m = await program.account.market.fetch(market);
  console.log("=== RESULT ===");
  console.log(`final outcome: HOME   winning pool: ${fmt(m.winningPool)}   payout pool: ${fmt(m.payoutPool)}   fee: ${fmt(m.feeCollected)} USDC`);
  console.log(`A staked 100 -> claimed ${fmt((await bal(A.ata)) - aBefore)}  (147 expected: 100/400 * 588)`);
  console.log(`B staked 300 -> claimed ${fmt((await bal(B.ata)) - bBefore)}  (441 expected: 300/400 * 588)`);
  console.log(`treasury fee collected: ${fmt(await bal(treasury))} USDC`);
  try {
    await claim(C.kp, C.ata);
    console.log("C (loser) claimed?! — unexpected");
  } catch {
    console.log("C (bet AWAY) has nothing to claim ✓");
  }
  console.log("\nDemo complete — full settlement flow ran on-chain.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
