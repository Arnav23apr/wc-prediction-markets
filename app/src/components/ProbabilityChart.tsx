"use client";

import React, { useMemo, useRef, useState } from "react";
import { MarketData, OUTCOMES, impliedPct } from "@/lib/markets";

/**
 * Terminal-style multi-outcome probability chart (the Polymarket-pro pattern):
 * one jagged line per outcome, legend chips with live prices, dotted rule at
 * the leading price, right-hand price axis, crosshair readout. Hand-drawn SVG,
 * no chart dependency.
 *
 * Only the *current* pool state exists on-chain, so the pre-kickoff history is
 * synthesised deterministically (seeded by matchId) and converges on the live
 * implied odds — labelled as such until the TxLINE stream is connected.
 */

const COLORS = ["#f26fae", "#8a8f98", "#6ba7f5"]; // Home / Draw / Away
const N = 120;
const VB_W = 1000;
const VB_H = 340;
const PAD = { l: 8, r: 46, t: 14, b: 24 };

function rng(seed: number) {
  let s = (seed % 2147483647) || 1;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

function buildSeries(market: MarketData): number[][] {
  const target = impliedPct(market.pools).map((p) => (p > 0 ? p : 33.3));
  const rand = rng(market.matchId + 7);
  const raw: number[][] = [0, 1, 2].map((i) => {
    const start = 33.3 + (rand() - 0.5) * 18;
    let wander = 0;
    return Array.from({ length: N }, (_, k) => {
      const t = k / (N - 1);
      wander = wander * 0.92 + (rand() - 0.5) * 2.6; // jagged random walk, decaying
      const drift = start + (target[i] - start) * (t * t * (3 - 2 * t));
      return Math.max(3, drift + wander * (1 - t * 0.85));
    });
  });
  return raw.map((series, i) => series.map((_, k) => {
    const sum = raw[0][k] + raw[1][k] + raw[2][k];
    return (raw[i][k] / sum) * 100;
  }));
}

export function ProbabilityChart({ market }: { market: MarketData }) {
  const series = useMemo(() => buildSeries(market), [market.matchId, market.pools.join(",")]);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const plotW = VB_W - PAD.l - PAD.r;
  const plotH = VB_H - PAD.t - PAD.b;
  const x = (k: number) => PAD.l + (k / (N - 1)) * plotW;
  const y = (v: number) => PAD.t + (1 - v / 100) * plotH;

  const paths = series.map((s) => s.map((v, k) => `${k === 0 ? "M" : "L"}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(" "));
  const live = impliedPct(market.pools);
  const lead = live.indexOf(Math.max(...live));

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(rel * (N - 1)));
  };

  const hx = hover !== null ? x(hover) : 0;
  const teamName = (i: number) => (i === 0 ? market.homeTeam : i === 2 ? market.awayTeam : "Draw");

  return (
    <div className="pchart">
      <div className="pchart-head">
        <div className="pchart-legend">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`pchart-key ${i === lead ? "lead" : ""}`}>
              <i style={{ background: COLORS[i] }} />{teamName(i)} <b>{live[i].toFixed(1)}%</b>
            </span>
          ))}
        </div>
        <div className="pchart-tools">
          <span className="pchart-range">All</span>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="pchart-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {[25, 50, 75].map((g) => (
          <line key={g} x1={PAD.l} x2={VB_W - PAD.r} y1={y(g)} y2={y(g)} className="pchart-grid" />
        ))}
        {/* dotted rule at the leading live price (the terminal's "last") */}
        <line x1={PAD.l} x2={VB_W - PAD.r} y1={y(live[lead])} y2={y(live[lead])}
          stroke={COLORS[lead]} strokeWidth={1} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" opacity={0.75} />
        {/* series */}
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={COLORS[i]} strokeWidth={i === lead ? 1.8 : 1.3}
            opacity={i === lead ? 1 : 0.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* live end-dots */}
        {series.map((s, i) => (
          <circle key={i} cx={x(N - 1)} cy={y(s[N - 1])} r={3} fill={COLORS[i]} vectorEffect="non-scaling-stroke" />
        ))}
        {/* right price axis */}
        {[25, 50, 75].map((g) => (
          <text key={g} x={VB_W - PAD.r + 8} y={y(g) + 4} className="pchart-ylabel">{g}%</text>
        ))}
        <text x={VB_W - PAD.r + 8} y={y(live[lead]) + 4} className="pchart-ylabel live" fill={COLORS[lead]}>
          {live[lead].toFixed(0)}%
        </text>
        {/* crosshair */}
        {hover !== null && (
          <>
            <line x1={hx} x2={hx} y1={PAD.t} y2={PAD.t + plotH} className="pchart-guide" />
            {series.map((s, i) => (
              <circle key={i} cx={hx} cy={y(s[hover])} r={4} fill={COLORS[i]} stroke="#0b0d11" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ))}
          </>
        )}
      </svg>

      <div className="pchart-axis">
        <span>-6w</span><span>-4w</span><span>-2w</span><span>kickoff</span>
      </div>

      {hover !== null && (
        <div className="pchart-tip" style={{ left: `${(hover / (N - 1)) * 100}%` }}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="pchart-tip-row"><i style={{ background: COLORS[i] }} />{teamName(i)}<b>{series[i][hover].toFixed(1)}%</b></span>
          ))}
        </div>
      )}

      <p className="pchart-note">Implied odds from live pool share · pre-kickoff history simulated until the TxLINE stream connects.</p>
    </div>
  );
}
