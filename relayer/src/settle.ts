/**
 * Settle a market: act as the oracle (commit_result) then finalize after the
 * dispute window — the real settlement pipeline. Waits for betting to close first.
 *
 *   RPC_URL=http://127.0.0.1:8899 PROGRAM_ID=<id> npx ts-node src/settle.ts <matchId> <outcome>
 *   (npm run settle -- 9301 0)   outcome: 0=Home 1=Draw 2=Away 255=Void
 */
import * as fs from "fs";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { buildCtx, marketPda, vaultPda } from "./program";
import { loadKeypair } from "./config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The local validator's clock can lag wall-clock time, so gate on ON-CHAIN time.
async function chainTime(conn: any): Promise<number> {
  return (await conn.getBlockTime(await conn.getSlot())) ?? 0;
}
async function waitUntilChain(conn: any, ts: number, label: string) {
  let t = await chainTime(conn);
  while (t < ts) {
    console.log(`  ${label}: on-chain ${ts - t}s to go...`);
    await sleep(4000);
    t = await chainTime(conn);
  }
}
async function withRetry(fn: () => Promise<string>, retryOn: RegExp): Promise<string> {
  for (;;) {
    try {
      return await fn();
    } catch (e: any) {
      if (retryOn.test(String(e))) {
        await sleep(3000);
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  const matchId = Number(process.argv[2]);
  const outcome = Number(process.argv[3]);
  if (!Number.isFinite(matchId) || !Number.isFinite(outcome)) {
    throw new Error("usage: settle <matchId> <outcome 0|1|2|255>");
  }
  const admin = loadKeypair(".demo-admin.json");
  const oracle = loadKeypair(".demo-oracle.json");
  const ctx = buildCtx(admin);
  const conn = ctx.connection;
  const program = ctx.program as any;
  const market = marketPda(matchId);

  const m = await program.account.market.fetch(market);

  await waitUntilChain(conn, Number(m.bettingCloseTs) + 1, "betting close");
  console.log(`oracle commit_result -> outcome ${outcome}`);
  await withRetry(
    () => program.methods.commitResult(outcome).accounts({ market, oracle: oracle.publicKey }).signers([oracle]).rpc(),
    /BettingStillOpen/
  );

  const window = Number(m.disputeWindow);
  console.log(`dispute window ${window}s open; waiting it out...`);
  await waitUntilChain(conn, (await chainTime(conn)) + window + 1, "dispute window");
  console.log("finalize...");
  await withRetry(
    () => program.methods.finalizeResult().accounts({ market, vault: vaultPda(market), treasury: m.treasury, tokenProgram: TOKEN_PROGRAM_ID }).rpc(),
    /DisputeWindowOpen/
  );

  const after = await program.account.market.fetch(market);
  const status = Object.keys(after.status)[0];
  console.log(`\nDone. Market is now: ${status.toUpperCase()}  (final outcome ${after.finalOutcome})`);
  console.log(`Refresh the UI and click "Claim winnings".`);
}

main().catch((e) => { console.error(e); process.exit(1); });
