"use client";

import React from "react";
import { MarketData, toUi, outcomeLabel } from "@/lib/markets";

/** Scrolling strip of live market state; gives the page a "busy venue" feel. */
export function ActivityTicker({ markets }: { markets: MarketData[] }) {
  if (markets.length === 0) return null;

  const items = markets.map((m) => {
    if (m.resultVerified && (m.status === "settled" || m.status === "voided")) {
      return { key: m.pubkey.toBase58(), badge: "✓", text: `${m.homeTeam} ${m.homeGoals}–${m.awayGoals} ${m.awayTeam} · verified`, accent: "win" };
    }
    if (m.status === "settled") {
      return { key: m.pubkey.toBase58(), badge: "●", text: `${m.homeTeam} v ${m.awayTeam} · settled ${outcomeLabel(m.finalOutcome)}`, accent: "muted" };
    }
    if (m.status === "resultProposed" || m.status === "disputed") {
      return { key: m.pubkey.toBase58(), badge: "◷", text: `${m.homeTeam} v ${m.awayTeam} · awaiting finalize`, accent: "warn" };
    }
    return { key: m.pubkey.toBase58(), badge: "▲", text: `${m.homeTeam} v ${m.awayTeam} · ${toUi(m.totalPool).toLocaleString()} USDC · ${m.numBettors} bettors`, accent: "gold" };
  });

  // Duplicate the row so the marquee loops seamlessly.
  const row = [...items, ...items];

  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {row.map((it, i) => (
          <span key={`${it.key}-${i}`} className="ticker-item">
            <span className={`ticker-badge ${it.accent}`}>{it.badge}</span>
            {it.text}
          </span>
        ))}
      </div>
    </div>
  );
}
