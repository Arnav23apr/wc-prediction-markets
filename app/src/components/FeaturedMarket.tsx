"use client";

import React from "react";
import {
  MarketData,
  OUTCOMES,
  impliedPct,
  payoutMultiplier,
  statusLabel,
  toUi,
} from "@/lib/markets";
import { useCountUp } from "@/lib/useCountUp";

/**
 * The hero's product visual: a live terminal panel for one featured market,
 * showing the pot and the parimutuel odds bars — the same data the market
 * cards trade on, rendered big. Deep-black, mono numbers, Linear-minimal.
 */
export function FeaturedMarket({ market }: { market: MarketData }) {
  const pct = impliedPct(market.pools);
  const pool = Math.round(useCountUp(toUi(market.totalPool), 800));
  const lead = pct.indexOf(Math.max(...pct));

  return (
    <div className="hpanel">
      <div className="hpanel-chrome">
        <span className="hpanel-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="hpanel-url">market://{market.homeTeam.toLowerCase().slice(0, 3)}-{market.awayTeam.toLowerCase().slice(0, 3)}</span>
      </div>
      <div className="hpanel-head">
        <span className="hp-tag">FEATURED MARKET</span>
        <span className={`hp-status badge-${market.status}`}>{statusLabel(market.status)}</span>
      </div>

      <div className="hp-teams">
        {market.homeTeam} <i>vs</i> {market.awayTeam}
      </div>

      <div className="hp-pot">
        <span className="hp-pot-label">TOTAL POT</span>
        <span className="hp-pot-val">
          ${pool.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
        <span className="hp-pot-sub">{market.numBettors} bettors · {market.feeBps / 100}% fee</span>
      </div>

      <div className="hp-bars">
        {OUTCOMES.map((label, i) => (
          <div className={`hp-row ${i === lead ? "lead" : ""}`} key={label}>
            <span className="hp-name">{label}</span>
            <span className="hp-track">
              <span className="hp-fill" style={{ width: `${Math.max(2, pct[i]).toFixed(1)}%` }} />
            </span>
            <span className="hp-pct">{pct[i].toFixed(0)}%</span>
            <span className="hp-mult">{payoutMultiplier(market.pools, i, market.feeBps).toFixed(2)}×</span>
          </div>
        ))}
      </div>

      <div className="hp-foot">
        <span className="hp-dot" />
        Settles on-chain from a TxLINE Merkle proof
      </div>
    </div>
  );
}
