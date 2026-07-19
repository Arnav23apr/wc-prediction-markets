"use client";

import React, { useEffect, useState } from "react";
import { Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  MarketData,
  OUTCOMES,
  impliedPct,
  payoutMultiplier,
  statusLabel,
  outcomeLabel,
  marketPhase,
  phaseLabel,
  toUi,
} from "@/lib/markets";
import { MarketCard } from "@/components/MarketCard";
import { PoolBook } from "@/components/PoolBook";
import { bookOdds, bookSourceLabel } from "@/lib/bookodds";
import { fetchRootRegistry, RegistryView, shortHash } from "@/lib/markets";
import { getReadonlyProgram } from "@/lib/program";
import { ProbabilityChart } from "@/components/ProbabilityChart";
import { RPC_URL, PROGRAM_ID } from "@/lib/program";
import { explorerUrl } from "@/lib/share";

interface Props {
  market: MarketData;
  program: Program<Idl> | null;
  owner: PublicKey | null;
  initialOutcome?: number;
  onChanged: () => void;
  onClose: () => void;
}

const short = (k: PublicKey) => { const s = k.toBase58(); return `${s.slice(0, 4)}…${s.slice(-4)}`; };
const fmtTs = (t: number) => new Date(t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function MarketDetail({ market, program, owner, initialOutcome, onChanged, onClose }: Props) {
  const phase = marketPhase(market);
  const [reg, setReg] = useState<RegistryView | null>(null);
  useEffect(() => {
    let on = true;
    fetchRootRegistry(getReadonlyProgram()).then((r) => on && setReg(r)).catch(() => {});
    return () => { on = false; };
  }, []);
  const book = bookOdds(market.matchId);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const pct = impliedPct(market.pools);
  const pool = toUi(market.totalPool);
  const now = Math.floor(Date.now() / 1000);
  const closesIn = Math.max(0, market.bettingCloseTs - now);
  const lead = pct.indexOf(Math.max(...pct));
  const link = (pk: PublicKey) => explorerUrl(pk.toBase58(), "address", RPC_URL);

  const stat = (label: string, value: React.ReactNode) => (
    <div className="md-stat"><span className="md-stat-l">{label}</span><span className="md-stat-v">{value}</span></div>
  );

  return (
    <div className="md-backdrop" onClick={onClose} data-lenis-prevent>
      <div className="md" role="dialog" aria-modal="true" aria-label={`${market.homeTeam} versus ${market.awayTeam} market`} onClick={(e) => e.stopPropagation()}>
        <header className="md-head">
          <div className="md-title">
            <span className="md-path">market://{market.homeTeam.toLowerCase().slice(0, 3)}-{market.awayTeam.toLowerCase().slice(0, 3)}</span>
            <h2>{market.homeTeam} <i>vs</i> {market.awayTeam}</h2>
          </div>
          <div className="md-head-right">
            <span className={`sb-status badge-${phase}`}>{phaseLabel(phase)}</span>
            <button className="md-close" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </header>

        <div className="md-statbar">
          {stat("TOTAL POT", `$${pool.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)}
          {stat("BETTORS", market.numBettors)}
          {stat(phase === "open" ? "CLOSES IN" : "STATUS", phase === "open" ? `${Math.floor(closesIn / 3600)}h ${Math.floor((closesIn % 3600) / 60)}m` : phase === "locked" ? "Locked · result at full time" : statusLabel(market.status))}
          {stat("FAVOURITE", `${OUTCOMES[lead]} · ${pct[lead].toFixed(0)}%`)}
          {stat("FEE", `${market.feeBps / 100}%`)}
        </div>

        <div className="md-body">
          <div className="md-main">
            <ProbabilityChart market={market} />

            <div className="md-panel">
              <span className="md-panel-h">TXLINE DATA</span>
              <div className="md-info">
                {stat("ODDS SOURCE", bookSourceLabel(book))}
                {stat("BOOK 1X2", book.decimal.map((d) => d.toFixed(2)).join(" / "))}
                {stat("FAIR PROBS", book.fair.map((f) => `${(f * 100).toFixed(0)}%`).join(" / "))}
                {stat("BATCH ROOT", reg?.isSet ? shortHash(reg.root) : "publishes at first settlement")}
                {stat("SCORE FEED", "event-level at kickoff · Merkle-proof settled")}
                {stat("FIXTURE", `match ${market.matchId} · 1X2 full-time`)}
                {stat("RESOLUTION", "TxLINE Merkle proof → validate_stat CPI · no oracle key can pay out")}
              </div>
            </div>

            <div className="md-panel">
              <span className="md-panel-h">MARKET INFO</span>
              <div className="md-info">
                {stat("MATCH ID", market.matchId)}
                {stat("BETTING CLOSES", fmtTs(market.bettingCloseTs))}
                {stat("DISPUTE WINDOW", `${market.disputeWindow}s`)}
                {market.status !== "open" && stat("PROPOSED", outcomeLabel(market.proposedOutcome))}
                {(market.status === "settled" || market.status === "voided") && stat("FINAL", <>{outcomeLabel(market.finalOutcome)}{market.resultVerified && market.finalOutcome < 3 && <> ({market.homeGoals}–{market.awayGoals})</>}</>)}
                <div className="md-stat"><span className="md-stat-l">VAULT</span><a className="md-stat-v md-link" href={link(market.vault)} target="_blank" rel="noreferrer">{short(market.vault)} ↗</a></div>
                <div className="md-stat"><span className="md-stat-l">TREASURY</span><a className="md-stat-v md-link" href={link(market.treasury)} target="_blank" rel="noreferrer">{short(market.treasury)} ↗</a></div>
                <div className="md-stat"><span className="md-stat-l">PROGRAM</span><a className="md-stat-v md-link" href={link(PROGRAM_ID)} target="_blank" rel="noreferrer">{short(PROGRAM_ID)} ↗</a></div>
              </div>
            </div>
          </div>

          <aside className="md-side">
            <PoolBook market={market} />
            <span className="md-side-h">TRADE</span>
            <MarketCard market={market} program={program} owner={owner} initialOutcome={initialOutcome} onChanged={onChanged} />
          </aside>
        </div>
      </div>
    </div>
  );
}
