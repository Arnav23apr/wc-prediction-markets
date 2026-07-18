import { config, isMockMode } from "./config";
import { makeTxOddsClient, resultToOutcome } from "./txodds";
import { oracleCtx } from "./program";
import { commitResult, finalizeResult, fetchMarket, disputeWindowEnded } from "./oracle";
import { mapValidationArgs, commitResultValidated } from "./validated";

const OUTCOME_LABEL: Record<number, string> = { 0: "HOME", 1: "DRAW", 2: "AWAY", 255: "VOID" };
const log = (...a: any[]) => console.log(new Date().toISOString(), ...a);

async function tick() {
  const ctx = oracleCtx();
  const tx = makeTxOddsClient();
  const fixtures = await tx.listFixtures();
  const now = Math.floor(Date.now() / 1000);

  for (const fx of fixtures) {
    try {
      const market = await fetchMarket(ctx, fx.matchId);
      if (!market) continue; // no market created for this fixture yet

      if (market.status === "open") {
        const result = await tx.getResult(fx.matchId);
        const outcome = resultToOutcome(result);
        if (outcome === null) continue; // not finished yet (betting close is enforced on-chain)
        log(`resolve ${fx.matchId} (${fx.homeTeam} v ${fx.awayTeam}) -> ${OUTCOME_LABEL[outcome]}`);

        // Preferred path: trustless CPI into TxLINE's validate_stat (no oracle key).
        if (config.useValidated && !isMockMode && outcome !== 255) {
          try {
            const proof = await tx.getStatValidation(fx.matchId, config.txScoreSeq, config.txStatKeyHome, config.txStatKeyAway);
            if (proof) {
              const sig = await commitResultValidated(ctx, fx.matchId, mapValidationArgs(proof));
              log(`  proposed (validate_stat CPI, trustless): ${sig}`);
              continue;
            }
            log(`  no stat-validation proof available; falling back to oracle commit`);
          } catch (e: any) {
            log(`  validated path failed (${shortErr(e)}); falling back to oracle commit`);
          }
        }

        // Fallback: trusted oracle-signed commit (also used for VOID / mock mode).
        try {
          const sig = await commitResult(ctx, fx.matchId, outcome);
          log(`  proposed (oracle): ${sig}`);
        } catch (e: any) {
          // e.g. BettingStillOpen if full-time data arrives before kickoff ts.
          log(`  skip commit ${fx.matchId}: ${shortErr(e)}`);
        }
      } else if (market.status === "resultProposed" && disputeWindowEnded(market, now)) {
        log(`finalize ${fx.matchId} (window elapsed)`);
        try {
          const sig = await finalizeResult(ctx, fx.matchId, market.treasury);
          log(`  finalized: ${sig}`);
        } catch (e: any) {
          log(`  skip finalize ${fx.matchId}: ${shortErr(e)}`);
        }
      }
    } catch (e: any) {
      log(`error on fixture ${fx.matchId}: ${shortErr(e)}`);
    }
  }
}

function shortErr(e: any): string {
  const s = e?.message ?? String(e);
  return s.split("\n")[0].slice(0, 160);
}

async function main() {
  log(`Relayer starting in ${isMockMode ? "MOCK" : "LIVE"} mode`);
  log(`RPC ${config.rpcUrl} | program ${config.programId.toBase58()} | poll ${config.pollIntervalMs}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (e: any) {
      log("tick failed:", shortErr(e));
    }
    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
