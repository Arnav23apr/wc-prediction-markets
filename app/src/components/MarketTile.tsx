"use client";

import React from "react";
import { MarketData, impliedPct, payoutMultiplier, toUi } from "@/lib/markets";
import { flagUrl, teamAbbr } from "@/lib/flags";

/**
 * Compact market tile (dashboard grid): two team rows with implied %, a
 * Home / Draw / Away chip strip, and the pool line. Tap anywhere → detail.
 */

interface Props {
  market: MarketData;
  onOpen: (m: MarketData, outcome?: number) => void;
  onCinema?: (m: MarketData) => void;
}

/** Relative close time — one clock format everywhere, no timezone ambiguity. */
const fmtCloses = (ts: number) => {
  const sec = ts - Math.floor(Date.now() / 1000);
  if (sec <= 0) return "closing";
  if (sec < 3600) return `closes in ${Math.max(1, Math.round(sec / 60))}m`;
  if (sec < 86400) return `closes in ${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
  return `closes in ${Math.floor(sec / 86400)}d`;
};

export function MarketTile({ market, onOpen, onCinema }: Props) {
  const pct = impliedPct(market.pools);
  const now = Math.floor(Date.now() / 1000);
  const open = market.status === "open" && now < market.bettingCloseTs;
  const terminal = market.status === "settled" || market.status === "voided";
  const hasScore = market.resultVerified && market.finalOutcome < 3;

  const Row = ({ team, p, goals, winner }: { team: string; p: number; goals?: number; winner?: boolean }) => {
    const f = flagUrl(team);
    return (
      <div className={`mt-row ${winner ? "win" : ""}`}>
        {f ? <img className="mt-flag" src={f} alt="" /> : <span className="mt-flag ph" />}
        <span className="mt-team">{team}</span>
        <span className="mt-pct">{terminal && goals !== undefined ? goals : market.totalPool === 0 ? "–" : `${p.toFixed(0)}%`}</span>
      </div>
    );
  };

  const chip = (label: string, i: number) => {
    const m = payoutMultiplier(market.pools, i, market.feeBps);
    return (
      <button
        key={label}
        className={`mt-chip ${terminal && market.finalOutcome === i ? "won" : ""}`}
        onClick={(e) => { e.stopPropagation(); onOpen(market, i); }}
      >
        {label}
        {open && <i>{m > 0 ? `${m.toFixed(2)}×` : "–"}</i>}
      </button>
    );
  };

  return (
    <article className="mt" onClick={() => onOpen(market)}>
      <div className="mt-top">
        <span title={new Date(market.bettingCloseTs * 1000).toLocaleString()}>
          {terminal ? (market.status === "voided" ? "Voided" : "Full time") : fmtCloses(market.bettingCloseTs)}
        </span>
        {market.resultVerified ? (
          <span className="mt-verified">✓ proof</span>
        ) : (
          <span className={`mt-status ${open ? "live" : ""}`}>{open ? "Open" : market.status === "open" ? "Locked" : market.status}</span>
        )}
      </div>

      <div className="mt-rows">
        <Row team={market.homeTeam} p={pct[0]} goals={hasScore ? market.homeGoals : undefined} winner={terminal && market.finalOutcome === 0} />
        <Row team={market.awayTeam} p={pct[2]} goals={hasScore ? market.awayGoals : undefined} winner={terminal && market.finalOutcome === 2} />
      </div>

      <div className="mt-chips">
        {chip(teamAbbr(market.homeTeam), 0)}
        {chip("Draw", 1)}
        {chip(teamAbbr(market.awayTeam), 2)}
      </div>

      <div className="mt-foot">
        <span>{toUi(market.totalPool).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC pool · {market.numBettors} bettors</span>
        {terminal && onCinema && market.finalOutcome < 3 ? (
          <button className="mt-replay" onClick={(e) => { e.stopPropagation(); onCinema(market); }}>▸ Replay</button>
        ) : (
          <button className="mt-more" onClick={(e) => { e.stopPropagation(); onOpen(market); }}>Details ↗</button>
        )}
      </div>
    </article>
  );
}
