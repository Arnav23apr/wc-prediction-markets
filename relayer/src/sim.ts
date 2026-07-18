/**
 * Full pipeline on the SIMULATED TxLINE feed, settling via the VERIFIED proof
 * path — the end-to-end "ingest a TxLINE feed and operate on it" story:
 *
 *   sim fixtures  →  create markets  →  bets  →  sim final scores
 *   →  build TxLINE-style Merkle proof  →  publish batch root
 *   →  commit_result_verified (on-chain verification)  →  finalize  →  claim
 *
 *   RPC_URL=http://127.0.0.1:8899 PROGRAM_ID=<id> npx ts-node src/sim.ts
 *   (npm run sim)
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
const log = (...a: any[]) => console.log(...a);

// On-chain time gate (validator clock can lag wall time).
const chainTime = async (c: Connection) => (await c.getBlockTime(await c.getSlot())) ?? 0;
async function waitChain(c: Connection, ts: number) {
  while ((await chainTime(c)) < ts) await sleep(3000);
}
async function retry(fn: () => Promise<string>, re: RegExp) {
  for (;;) {
    try { return await fn(); } catch (e: any) { if (re.test(String(e))) { await sleep(2500); continue; } throw e; }
  }
}

// Simulated TxLINE feed: fixtures + final scores (Home / Away / Draw).
const FEED = [
  { matchId: 8501, home: "Argentina", away: "France", hg: 2, ag: 1 },
  { matchId: 8502, home: "Brazil", away: "England", hg: 1, ag: 2 },
  { matchId: 8503, home: "Spain", away: "Germany", hg: 1, ag: 1 },
];

async function main() {
  // Persistent admin so it stays the registry's root authority across runs.
  const admin = loadOrCreateKeypair(".demo-admin.json");
  const ctx = buildCtx(admin);
  const conn = ctx.connection;
  const program = ctx.program as any;
  log(`\nSimulated TxLINE feed → verified settlement | program ${config.programId.toBase58()}\n`);
  await conn.confirmTransaction(await conn.requestAirdrop(admin.publicKey, 20 * LAMPORTS_PER_SOL), "confirmed");

  const mint = await createMint(conn, admin, admin.publicKey, null, 6);
  const treasury = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, admin.publicKey)).address;
  const registry = PublicKey.findProgramAddressSync([Buffer.from("root_registry")], program.programId)[0];
  try {
    await program.methods.initRootRegistry(admin.publicKey)
      .accounts({ payer: admin.publicKey, registry, systemProgram: SystemProgram.programId }).rpc();
  } catch { /* exists */ }
  const reg = await program.account.rootRegistry.fetch(registry);
  if (!reg.authority.equals(admin.publicKey)) {
    throw new Error(
      "root registry is owned by a different key on this validator.\n" +
        "Run on a fresh validator: `bash scripts/localnet.sh` (resets), then `npm run sim`."
    );
  }

  const fund = async (give: number) => {
    const kp = Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL), "confirmed");
    const ata = (await getOrCreateAssociatedTokenAccount(conn, admin, mint, kp.publicKey)).address;
    await mintTo(conn, admin, mint, ata, admin, BigInt(usdc(give).toString()));
    return { kp, ata };
  };
  const backer = await fund(5000); // backs the eventual winner each match
  const fader = await fund(5000); // backs a losing side

  log(`Ingested ${FEED.length} fixtures from the (simulated) TxLINE feed.\n`);

  for (const fx of FEED) {
    const market = marketPda(fx.matchId);
    const vault = vaultPda(market);
    const outcome = fx.hg > fx.ag ? 0 : fx.hg < fx.ag ? 2 : 1;
    log(`── ${fx.home} v ${fx.away} (fixture ${fx.matchId})`);

    await program.methods
      .initializeMarket(new BN(fx.matchId), new BN(Math.floor(Date.now() / 1000) + 6), new BN(2), 200, admin.publicKey, admin.publicKey, fx.home, fx.away)
      .accounts({ authority: admin.publicKey, market, usdcMint: mint, vault, treasury, tokenProgram: TOKEN_PROGRAM_ID }).rpc();

    const bet = (kp: Keypair, ata: PublicKey, o: number, amt: number) =>
      program.methods.placeBet(o, usdc(amt))
        .accounts({ bettor: kp.publicKey, market, position: positionPda(market, kp.publicKey), vault, bettorTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([kp]).rpc();
    await bet(backer.kp, backer.ata, outcome, 100);
    await bet(fader.kp, fader.ata, (outcome + 1) % 3, 200);
    log(`   market open, bets placed`);

    // Full time on the feed → build the proof + publish the batch root.
    const { args, root } = mockProof(fx.hg, fx.ag);
    await waitChain(conn, Math.floor(Date.now() / 1000) + 6);
    await program.methods.setScoreRoot(root).accounts({ registry, authority: admin.publicKey }).rpc();
    log(`   full time ${fx.hg}-${fx.ag} → published TxLINE batch root`);

    await retry(
      () => program.methods.commitResultVerified(args.homeGoals, args.awayGoals, args.homeProof, args.awayProof, args.subTreeProof, args.mainTreeProof)
        .accounts({ submitter: admin.publicKey, market, registry }).rpc(),
      /BettingStillOpen/
    );
    const m1 = await program.account.market.fetch(market);
    log(`   commit_result_verified ✓ proof OK → outcome ${m1.proposedOutcome}, verified=${m1.resultVerified}`);

    await waitChain(conn, (await chainTime(conn)) + 3);
    await retry(
      () => program.methods.finalizeResult().accounts({ market, vault, treasury, tokenProgram: TOKEN_PROGRAM_ID }).rpc(),
      /DisputeWindowOpen/
    );
    const before = Number((await getAccount(conn, backer.ata)).amount);
    await program.methods.claim()
      .accounts({ claimant: backer.kp.publicKey, market, position: positionPda(market, backer.kp.publicKey), vault, claimantTokenAccount: backer.ata, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([backer.kp]).rpc();
    log(`   finalized + winner claimed ${fmt(Number((await getAccount(conn, backer.ata)).amount) - before)} USDC\n`);
  }

  log(`Done — ${FEED.length} markets settled end-to-end from the simulated feed, each verified on-chain by Merkle proof.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
