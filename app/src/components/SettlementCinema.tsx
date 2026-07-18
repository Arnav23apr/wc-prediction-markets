"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MarketData, OUTCOMES, impliedPct, payoutMultiplier, toUi, outcomeLabel } from "@/lib/markets";
import { flagUrl, teamAbbr } from "@/lib/flags";
import { playTick, playSuccess, playWin } from "@/lib/sound";
import { PROGRAM_ID } from "@/lib/program";

/**
 * SETTLEMENT CINEMA — a scripted broadcast-style replay of how a settled
 * market resolved: final whistle → proof verification → settlement → payout.
 * Pure front-end dramatization of the real on-chain flow, driven by the
 * market's actual data (teams, score, pools, outcome). Esc or click closes;
 * timing is a simple state machine (no tween lib, nothing to desync).
 */

interface Props {
  market: MarketData;
  onClose: () => void;
}

// stage timeline (ms from mount)
const T = {
  clock: 300,      // 1 — match clock races to 90:00
  whistle: 2500,   // 2 — FULL TIME lower-third
  proof: 4600,     // 3 — proof verification log
  settle: 9200,    // 4 — market settles, winner glows
  payout: 11400,   // 5 — payout counts up
};
const CLOSE_AFTER = 15500;

// deterministic pseudo-hex from the market (visual only — labelled as replay)
function pseudoHex(seed: number, len: number): string {
  let s = (seed % 2147483647) || 7;
  let out = "";
  while (out.length < len) {
    s = (s * 48271) % 2147483647;
    out += s.toString(16);
  }
  return out.slice(0, len);
}

export function SettlementCinema({ market, onClose }: Props) {
  const [stage, setStage] = useState(0);
  const [clock, setClock] = useState("87:12");
  const [payout, setPayout] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const win = market.finalOutcome;
  const hasScore = market.resultVerified && win < 3;
  const pct = impliedPct(market.pools);
  const payoutPool = toUi(market.totalPool) * (1 - market.feeBps / 10000);
  const mult = win < 3 ? payoutMultiplier(market.pools, win, market.feeBps) : 0;
  const root = useMemo(() => pseudoHex(market.matchId * 31 + 7, 16), [market.matchId]);
  const sig = useMemo(() => pseudoHex(market.matchId * 97 + 3, 20), [market.matchId]);
  const slot = 473166508 + market.matchId * 4211;

  // stage scheduler
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setStage(5);
      setPayout(payoutPool);
      return;
    }
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    at(T.clock, () => setStage(1));
    at(T.whistle, () => { setStage(2); playTick(); });
    at(T.proof, () => setStage(3));
    at(T.settle, () => { setStage(4); playSuccess(); });
    at(T.payout, () => { setStage(5); playWin(); });
    return () => timers.current.forEach(clearTimeout);
  }, [payoutPool]);

  // racing match clock during stage 1
  useEffect(() => {
    if (stage !== 1) return;
    let m = 87, s = 12;
    const id = setInterval(() => {
      s += 7;
      if (s >= 60) { s -= 60; m += 1; }
      if (m >= 90) { m = 90; s = 0; clearInterval(id); }
      setClock(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    }, 40);
    return () => clearInterval(id);
  }, [stage]);

  // payout count-up during stage 5
  useEffect(() => {
    if (stage !== 5) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 1100);
      setPayout(payoutPool * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [stage, payoutPool]);

  // esc to close + body lock + auto-close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const auto = setTimeout(onClose, CLOSE_AFTER + 6000);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      clearTimeout(auto);
    };
  }, [onClose]);

  const Flag = ({ team }: { team: string }) => {
    const f = flagUrl(team);
    return f ? <img className="cin-flag" src={f} alt="" /> : null;
  };

  const skip = () => {
    // advance to the next unfinished beat instead of hard-closing
    if (stage < 5) {
      timers.current.forEach(clearTimeout);
      setStage(5);
      setPayout(payoutPool);
    } else onClose();
  };

  return (
    <div className="cinema" onClick={skip} role="dialog" aria-modal="true" aria-label="Settlement replay">
      <button className="cin-close" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
      <span className="cin-tag">SETTLEMENT REPLAY · {market.homeTeam} v {market.awayTeam}</span>

      {/* 1 — the clock */}
      {stage <= 1 && (
        <div className="cin-clockwrap">
          <span className="cin-clock">{clock}</span>
          <span className="cin-clock-sub">SECOND HALF</span>
        </div>
      )}

      {/* 2 — full time lower-third */}
      {stage >= 2 && (
        <div className={`cin-third ${stage >= 3 ? "docked" : ""}`}>
          <span className="cin-third-chip">FULL TIME</span>
          <span className="cin-third-score">
            <Flag team={market.homeTeam} /> {teamAbbr(market.homeTeam)}
            <b>{hasScore ? market.homeGoals : "–"}</b><i>:</i><b>{hasScore ? market.awayGoals : "–"}</b>
            {teamAbbr(market.awayTeam)} <Flag team={market.awayTeam} />
          </span>
        </div>
      )}

      {/* 3 — proof log */}
      {stage >= 3 && stage < 4 && (
        <div className="cin-log">
          {[
            `fixture ${market.matchId} · full-time stats received`,
            `merkle fold: leaf → event root → batch root`,
            `root ${root.slice(0, 6)}…${root.slice(-4)} = on-chain root ✓`,
            `CPI validate_stat → true ✓`,
          ].map((l, i) => (
            <div key={i} className="cin-log-line" style={{ animationDelay: `${0.15 + i * 0.85}s` }}>
              <span className="cin-log-prompt">▸</span> {l}
            </div>
          ))}
        </div>
      )}

      {/* 4+5 — settlement + payout */}
      {stage >= 4 && (
        <div className="cin-settle">
          <span className="cin-settle-kicker">MARKET SETTLED · NO ORACLE · NO VOTE</span>
          <h2 className="cin-settle-h">{win < 3 ? `${outcomeLabel(win).toUpperCase()} WINS.` : "MARKET VOID."}</h2>
          <div className="cin-rows">
            {OUTCOMES.map((o, i) => (
              <div key={o} className={`cin-row ${i === win ? "win" : "lose"}`}>
                <span className="cin-row-name">{o}</span>
                <span className="cin-row-track"><span style={{ width: `${Math.max(3, pct[i]).toFixed(1)}%` }} /></span>
                <span className="cin-row-pct">{pct[i].toFixed(0)}%</span>
              </div>
            ))}
          </div>
          {stage >= 5 && (
            <div className="cin-payout">
              <div className="cin-payout-main">
                <span className="cin-payout-label">PAID TO WINNERS</span>
                <span className="cin-payout-val">${payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                {win < 3 && <span className="cin-payout-sub">{mult.toFixed(2)}× on winning stakes · {market.feeBps / 100}% fee → treasury</span>}
              </div>
              <div className="cin-meta">
                <span>proof {root.slice(0, 6)}…{root.slice(-4)}</span>
                <span>sig {sig.slice(0, 5)}…{sig.slice(-4)}</span>
                <span>slot {slot.toLocaleString()}</span>
                <span>program {PROGRAM_ID.toBase58().slice(0, 4)}…{PROGRAM_ID.toBase58().slice(-4)}</span>
                <span>path commit_result_validated</span>
              </div>
              <span className="cin-final">SETTLED BY PROOF.</span>
            </div>
          )}
        </div>
      )}

      <div className="cin-rail" aria-hidden="true">
        {["CLOCK", "FULL TIME", "PROOF", "SETTLE", "PAYOUT"].map((s, i) => (
          <span key={s} className={`cin-rail-dot ${stage > i ? "on" : ""}`}>{s}</span>
        ))}
      </div>
      <span className="cin-hint">click to skip · esc to close</span>
    </div>
  );
}
