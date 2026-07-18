/**
 * End-to-end demo of the VERIFIED settlement path against a running validator:
 * publish a (mock) TxLINE batch root, then settle a market by Merkle proof — no
 * trusted oracle key, the proof is the authorization.
 *
 *   RPC_URL=http://127.0.0.1:8899 PROGRAM_ID=<id> npx ts-node src/verifiedDemo.ts
 *   (npm run verified-demo)
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Connection } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { buildCtx, marketPda, vaultPda, positionPda } from "./program";
import { config, loadOrCreateKeypair } from "./config";
import { mockProof } from "./verified";

const usdc = (n: number) => new BN(Math.round(n * 1e6));
const fmt = (b: number | bigint) => (Number(b) / 1e6).toLocaleString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const air = async (c: Connection, pk: PublicKey, s: number) =>
  c.confirmTransaction(await c.requestAirdrop(pk, s * LAMPORTS_PER_SOL), "confirmed");

async function main() {
  const admin = loadOrCreateKeypair(".demo-admin.json"); // stable registry authority
  const ctx = buildCtx(admin);
  const conn = ctx.connection;
  const program = ctx.program as any;
  console.log(`\nRPC ${config.rpcUrl} | program ${config.programId.toBase58()}\n`);
  await air(conn, admin.publicKey, 10);

  const mint = await createMint(conn, admin, admin.publicKey, null, 6);
  const treasury = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, admin.publicKey)).address;
  const registry = PublicKey.findProgramAddressSync([Buffer.from("root_registry")], program.programId)[0];

  // Final score Morocco 2 - 1 Croatia -> Home. Build the proof + batch root.
  const { args, root } = mockProof(2, 1);
  try {
    await program.methods.initRootRegistry(admin.publicKey)
      .accounts({ payer: admin.publicKey, registry, systemProgram: SystemProgram.programId }).rpc();
    console.log("root registry initialised");
  } catch { console.log("root registry already exists"); }
  await program.methods.setScoreRoot(root).accounts({ registry, authority: admin.publicKey }).rpc();
  console.log("published TxLINE batch root\n");

  const mk = async (give: number) => {
    const kp = Keypair.generate();
    await air(conn, kp.publicKey, 1);
    const ata = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, kp.publicKey)).address;
    await mintTo(conn, admin, mint, ata, admin, BigInt(usdc(give).toString()));
    return { kp, ata };
  };
  const A = await mk(1000), B = await mk(1000);

  const matchId = new BN(Date.now() % 1_000_000);
  const market = marketPda(BigInt(matchId.toString()));
  const vault = vaultPda(market);
  await program.methods
    .initializeMarket(matchId, new BN(Math.floor(Date.now() / 1000) + 6), new BN(2), 200, admin.publicKey, admin.publicKey, "Morocco", "Croatia")
    .accounts({ authority: admin.publicKey, market, usdcMint: mint, vault, treasury, tokenProgram: TOKEN_PROGRAM_ID }).rpc();

  const bet = (kp: Keypair, ata: PublicKey, o: number, amt: BN) =>
    program.methods.placeBet(o, amt)
      .accounts({ bettor: kp.publicKey, market, position: positionPda(market, kp.publicKey), vault, bettorTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([kp]).rpc();
  await bet(A.kp, A.ata, 0, usdc(100)); // HOME
  await bet(B.kp, B.ata, 2, usdc(300)); // AWAY
  console.log("Morocco vs Croatia: A=100 HOME, B=300 AWAY (pool 400)\n");

  console.log("waiting for betting to close...");
  await sleep(7000);
  // PERMISSIONLESS verified commit — anyone with the proof can submit it.
  await program.methods
    .commitResultVerified(args.homeGoals, args.awayGoals, args.homeProof, args.awayProof, args.subTreeProof, args.mainTreeProof)
    .accounts({ submitter: admin.publicKey, market, registry }).rpc();
  const proposed = await program.account.market.fetch(market);
  console.log(`commit_result_verified: proof OK -> outcome ${proposed.proposedOutcome} (0=Home), result_verified=${proposed.resultVerified}`);

  await sleep(5500);
  await program.methods.finalizeResult().accounts({ market, vault, treasury, tokenProgram: TOKEN_PROGRAM_ID }).rpc();

  const before = Number((await getAccount(conn, A.ata)).amount);
  await program.methods.claim()
    .accounts({ claimant: A.kp.publicKey, market, position: positionPda(market, A.kp.publicKey), vault, claimantTokenAccount: A.ata, tokenProgram: TOKEN_PROGRAM_ID })
    .signers([A.kp]).rpc();
  const m = await program.account.market.fetch(market);
  console.log(`\n=== VERIFIED SETTLEMENT ===`);
  console.log(`outcome derived from PROVEN score 2-1 -> HOME | verified=${m.resultVerified} | fee ${fmt(m.feeCollected)}`);
  console.log(`A staked 100 -> claimed ${fmt(Number((await getAccount(conn, A.ata)).amount) - before)} USDC`);
  console.log(`\nNo oracle key was trusted — the Merkle proof against the published root settled it.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
