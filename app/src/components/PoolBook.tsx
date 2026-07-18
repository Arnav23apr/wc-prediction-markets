"use client";

import React from "react";
import { MarketData, impliedPct, payoutMultiplier, toUi } from "@/lib/markets";
import { bookOdds, bookSourceLabel } from "@/lib/bookodds";
import { teamAbbr } from "@/lib/flags";

/**
 * The orderbook panel, translated honestly to parimutuel: per-outcome rows
 * with depth-shaded stake bars, pool payout vs bookmaker fair value, and
 * edge colouring (green = pool pays over fair, red = crowd has overbet it).
 */
export function PoolBook({ market }: { market: MarketData }) {
  const pct = impliedPct(market.pools);
  const book = bookOdds(market.matchId);
  const total = toUi(market.totalPool);
  const names = [teamAbbr(market.homeTeam), "Draw", teamAbbr(market.awayTeam)];
  const share = market.totalPool > 0 ? market.pools.map((p) => p / market.totalPool) : [0, 0, 0];

  const rows = [0, 1, 2].map((i) => {
    const mult = payoutMultiplier(market.pools, i, market.feeBps);
    const fairMult = 1 / book.fair[i];
    const edge = mult > 0 ? (mult / fairMult - 1) * 100 : null;
    return { i, mult, fairMult, edge, stake: toUi(market.pools[i]) };
  });

  const homeShare = share[0] * 100;
  const awayShare = share[2] * 100;

  return (
    <div className="pbook">
      <div className="pbook-head">
        <span className="pbook-title">POOL BOOK</span>
        <span className="pbook-src">{bookSourceLabel(book)}</span>
      </div>

      {/* balance bar: which end holds the money */}
      <div className="pbook-balance">
        <b>{names[0]} {homeShare.toFixed(0)}%</b>
        <span className="pbook-balance-track">
          <i className="h" style={{ width: `${Math.max(2, homeShare)}%` }} />
          <i className="d" style={{ width: `${Math.max(2, share[1] * 100)}%` }} />
          <i className="a" style={{ width: `${Math.max(2, awayShare)}%` }} />
        </span>
        <b>{awayShare.toFixed(0)}% {names[2]}</b>
      </div>

      <div className="pbook-cols">
        <span>Outcome</span><span>Stake</span><span>Pays</span><span>vs fair</span>
      </div>

      {rows.map(({ i, mult, fairMult, edge, stake }) => (
        <div key={i} className={`pbook-row ${edge !== null && edge >= 0 ? "up" : edge !== null ? "down" : ""}`}>
          <i className="pbook-depth" style={{ width: `${Math.max(2, share[i] * 100)}%` }} />
          <span className="pbook-name">{names[i]}</span>
          <span className="pbook-stake">{stake.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          <span className="pbook-mult">{mult > 0 ? `${mult.toFixed(2)}×` : "–"}</span>
          <span className="pbook-edge">
            {edge === null ? `fair ${fairMult.toFixed(2)}×` : `${edge >= 0 ? "+" : ""}${edge.toFixed(0)}%`}
          </span>
        </div>
      ))}

      <div className="pbook-meta">
        <span>Pool <b>${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></span>
        <span>Overround (books) <b>5.0%</b></span>
        <span>Protocol fee <b>{market.feeBps / 100}%</b></span>
      </div>
    </div>
  );
}
