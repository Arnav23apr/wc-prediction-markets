/**
 * The Striker engine: one poll loop that
 *  1. fires ODDS ORDERS when a market's multiplier crosses the target,
 *  2. alerts (or auto-bets) SNIPERS when a new market opens,
 *  3. mirrors bets for COPY-BETTING follows,
 *  4. notifies bettors when their market settles (with the proof status).
 */
import type { Api } from "grammy";
import * as store from "./store";
import {
  fetchMarkets, fetchPositions, isOpen, multiplier, placeBet, toUi, OUTCOMES, ownerOf, Market,
} from "./chain";

const label = (m: Market) => `${m.home} v ${m.away}`;

import * as fs from "fs";
const DECISION_LOG = "striker-decisions.log";
export function logDecision(kind: string, detail: string) {
  const line = `${new Date().toISOString()} [${kind}] ${detail}\n`;
  try { fs.appendFileSync(DECISION_LOG, line); } catch { /* best-effort */ }
  console.log(line.trim());
}

export async function tick(api: Api) {
  let markets: Market[];
  try { markets = await fetchMarkets(); } catch { return; }
  const byId = new Map(markets.map((m) => [m.matchId, m]));

  // --- 1. odds orders ---
  for (const o of store.listOrders()) {
    const m = byId.get(o.matchId);
    if (!m) continue;
    if (!isOpen(m)) {
      store.removeOrder(o.id);
      await api.sendMessage(o.tgId, `Odds order #${o.id} on ${label(m)} expired: market closed.`).catch(() => {});
      continue;
    }
    const cur = multiplier(m, o.outcome);
    if (cur >= o.minMult && cur > 0) {
      try {
        const sig = await placeBet(o.tgId, m, o.outcome, o.amount);
        logDecision("odds-order", `user=${o.tgId} ${m.home} v ${m.away} outcome=${OUTCOMES[o.outcome]} amt=${o.amount} trigger>=${o.minMult}x got=${multiplier(m, o.outcome).toFixed(2)}x sig=${sig.slice(0, 12)}`);
        store.removeOrder(o.id);
        await api.sendMessage(
          o.tgId,
          `ODDS ORDER FILLED\n${label(m)} · ${OUTCOMES[o.outcome]} hit ${cur.toFixed(2)}x (target ${o.minMult.toFixed(2)}x)\n` +
          `Bet ${o.amount} USDC placed. ${sig.slice(0, 8)}…`
        ).catch(() => {});
      } catch (e: any) {
        store.removeOrder(o.id);
        await api.sendMessage(o.tgId, `Odds order #${o.id} failed: ${String(e.message ?? e).slice(0, 100)}`).catch(() => {});
      }
    }
  }

  // --- 2. new-market sniping ---
  const known = store.knownMarkets();
  const fresh = markets.filter((m) => !known.has(m.matchId));
  if (fresh.length > 0) {
    store.rememberMarkets(markets.map((m) => m.matchId));
    for (const m of fresh.filter(isOpen)) {
      for (const s of store.listSnipers()) {
        if (s.auto) {
          try {
            const sig = await placeBet(s.tgId, m, 0, s.auto);
            logDecision("snipe", `user=${s.tgId} new-market ${m.home} v ${m.away} amt=${s.auto} sig=${sig.slice(0, 12)}`);
            await api.sendMessage(s.tgId, `SNIPED: ${label(m)} just opened. ${s.auto} USDC on ${m.home} while the pool is thin. ${sig.slice(0, 8)}…`).catch(() => {});
          } catch { /* funding or race; alert instead */
            await api.sendMessage(s.tgId, `New market: ${label(m)}. Auto-snipe failed, bet manually with /markets.`).catch(() => {});
          }
        } else {
          await api.sendMessage(s.tgId, `NEW MARKET: ${label(m)} is open. Early pools pay the best multipliers. /markets`).catch(() => {});
        }
      }
    }
  }

  // --- 3. copy-betting ---
  const follows = store.listFollows();
  if (follows.length > 0) {
    let positions: Awaited<ReturnType<typeof fetchPositions>> = [];
    try { positions = await fetchPositions(); } catch { /* transient rpc */ }
    const marketByKey = new Map(markets.map((m) => [m.pubkey.toBase58(), m]));
    for (const p of positions) {
      const m = marketByKey.get(p.market.toBase58());
      if (!m || !isOpen(m)) continue;
      for (let outcome = 0; outcome < 3; outcome++) {
        const stake = p.stakes[outcome];
        if (stake <= 0) continue;
        const key = `${p.owner}:${m.matchId}:${outcome}`;
        const seen = store.copySeen(key);
        if (stake > seen) {
          store.setCopySeen(key, stake);
          if (seen === 0) {
            for (const f of follows.filter((f) => f.target === p.owner)) {
              if (ownerOf(f.tgId).toBase58() === p.owner) continue; // don't copy yourself
              try {
                const sig = await placeBet(f.tgId, m, outcome, f.amount);
                logDecision("copy", `follower=${f.tgId} mirrors ${p.owner.slice(0, 8)} ${m.home} v ${m.away} outcome=${OUTCOMES[outcome]} amt=${f.amount} sig=${sig.slice(0, 12)}`);
                await api.sendMessage(
                  f.tgId,
                  `COPIED: ${p.owner.slice(0, 4)}… bet ${toUi(stake).toFixed(0)} USDC on ${OUTCOMES[outcome]} in ${label(m)}.\n` +
                  `Mirrored with your ${f.amount} USDC. ${sig.slice(0, 8)}…`
                ).catch(() => {});
              } catch (e: any) {
                await api.sendMessage(f.tgId, `Copy failed on ${label(m)}: ${String(e.message ?? e).slice(0, 80)}`).catch(() => {});
              }
            }
          }
        }
      }
    }
  }

  // --- 4. settlement notifications ---
  const done = store.settledNotified();
  for (const m of markets.filter((m) => (m.status === "settled" || m.status === "voided") && !done.has(m.matchId))) {
    store.markSettled(m.matchId);
    let positions;
    try { positions = await fetchPositions(); } catch { continue; }
    const holders = positions.filter((p) => p.market.equals(m.pubkey));
    for (const tgId of store.allUsers()) {
      const mine = holders.find((p) => p.owner === ownerOf(tgId).toBase58());
      if (!mine) continue;
      const won = m.finalOutcome < 3 && mine.stakes[m.finalOutcome] > 0;
      await api.sendMessage(
        tgId,
        `SETTLED${m.resultVerified ? " BY PROOF ✓" : ""}: ${label(m)}` +
        (m.finalOutcome < 3 ? ` → ${OUTCOMES[m.finalOutcome]} (${m.homeGoals}-${m.awayGoals})` : " → VOID (full refunds)") +
        `\n${won ? "You WON. /claim to collect." : m.status === "voided" ? "Refund available. /claim." : "Not this time."}`
      ).catch(() => {});
    }
  }
}

export function startEngine(api: Api, intervalMs = 12_000) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { agentTick } = require("./agent");
  setInterval(() => {
    tick(api).catch((e) => console.error("engine:", e.message ?? e));
    agentTick().catch((e: any) => console.error("agent:", e.message ?? e));
  }, intervalMs);
  console.log(`engine running every ${intervalMs / 1000}s`);
}
