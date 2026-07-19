/**
 * Striker autonomous agent — the "deploy it and it trades on its own" mode.
 *
 * No human input, ever: on each engine cycle it scans every open funded market,
 * computes the edge of the pool payout vs bookmaker fair value, and stakes a
 * fixed size on the single best value bet it can find above a threshold, from
 * its own dedicated wallet. Every decision (bet, skip, hold) is written to the
 * shared decision log with its reasoning and tx signature.
 *
 * Strategy in one sentence: bet when the pool pays more than the bookmaker's
 * overround-stripped fair price, biggest edge first, once per outcome.
 */
import {
  fetchMarkets, isOpen, multiplier, placeBet, ensureFunded, usdcBalance, ownerOf, Market,
} from "./chain";
import { bookOdds, edgesFor } from "./txline";
import { logDecision } from "./engine";

/** Reserved synthetic user id → a persistent, isolated agent keypair. */
export const AGENT_ID = 424242;

const ENABLED = process.env.AGENT_ENABLED !== "0";
const MIN_EDGE = Number(process.env.AGENT_MIN_EDGE ?? 12); // % pool pays over bookmaker fair
const STAKE = Number(process.env.AGENT_STAKE ?? 15);        // USDC per value bet

const placed = new Set<string>(); // `${matchId}:${outcome}` already entered this run
let funded = false;
let cycle = 0;

export function agentInfo() {
  return { id: AGENT_ID, wallet: ownerOf(AGENT_ID).toBase58(), enabled: ENABLED, minEdge: MIN_EDGE, stake: STAKE, betsPlaced: placed.size };
}

export async function agentTick() {
  if (!ENABLED) return;
  cycle++;

  let markets: Market[];
  try { markets = (await fetchMarkets()).filter(isOpen).filter((m) => m.totalPool > 0); } catch { return; }
  if (markets.length === 0) return;

  if (!funded) {
    try {
      await ensureFunded(AGENT_ID);
      funded = true;
      logDecision("agent", `online · wallet ${ownerOf(AGENT_ID).toBase58().slice(0, 8)} · scanning ${markets.length} markets · rule: bet ≥ +${MIN_EDGE}% edge, ${STAKE} USDC/bet`);
    } catch { return; }
  }

  // Best value bet across all markets this cycle.
  let best: { m: Market; outcome: number; edge: number; poolMult: number; fairMult: number } | null = null;
  for (const m of markets) {
    let book;
    try { book = await bookOdds(m); } catch { continue; }
    for (const e of edgesFor(m, book, (o) => multiplier(m, o))) {
      if (placed.has(`${m.matchId}:${e.outcome}`)) continue;
      if (e.edgePct < MIN_EDGE) continue;
      if (!best || e.edgePct > best.edge) best = { m, outcome: e.outcome, edge: e.edgePct, poolMult: e.poolMult, fairMult: e.fairMult };
    }
  }

  if (!best) {
    if (cycle % 5 === 1) logDecision("agent", `scanned ${markets.length} markets · nothing ≥ +${MIN_EDGE}% edge · holding`);
    return;
  }

  let bal = 0;
  try { bal = await usdcBalance(AGENT_ID); } catch {}
  if (bal < STAKE) {
    logDecision("agent", `edge on ${best.m.home} v ${best.m.away} (+${best.edge.toFixed(0)}%) but balance ${bal.toFixed(0)} < ${STAKE} · standing down`);
    return;
  }

  const name = best.outcome === 0 ? best.m.home : best.outcome === 2 ? best.m.away : "Draw";
  try {
    const sig = await placeBet(AGENT_ID, best.m, best.outcome, STAKE);
    placed.add(`${best.m.matchId}:${best.outcome}`);
    logDecision("agent", `BET ${STAKE} on ${name} · ${best.m.home} v ${best.m.away} · pool ${best.poolMult.toFixed(2)}x vs fair ${best.fairMult.toFixed(2)}x → +${best.edge.toFixed(0)}% edge · sig=${sig.slice(0, 12)}`);
  } catch (e: any) {
    logDecision("agent", `bet failed on ${best.m.home} v ${best.m.away}: ${String(e.message ?? e).slice(0, 60)}`);
  }
}
