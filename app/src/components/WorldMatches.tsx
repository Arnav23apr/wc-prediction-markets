"use client";

import React, { useEffect } from "react";
import { MarketData, statusLabel, toUi } from "@/lib/markets";
import { flagUrl, teamAbbr, kitColor } from "@/lib/flags";

// 2026 World Cup host cities (US / Canada / Mexico).
const HOST_CITIES = [
  "New York / NJ", "Los Angeles", "Dallas", "Kansas City", "Atlanta", "Houston",
  "Boston", "Philadelphia", "Miami", "Seattle", "Bay Area", "Toronto",
  "Vancouver", "Mexico City", "Guadalajara", "Monterrey",
];

function hostCity(m: MarketData): string {
  const s = m.pubkey.toBase58();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HOST_CITIES[h % HOST_CITIES.length];
}

function whenLabel(m: MarketData): string {
  if (m.status !== "open") return statusLabel(m.status);
  const s = m.bettingCloseTs - Math.floor(Date.now() / 1000);
  if (s <= 0) return "Closed";
  if (s < 3600) return `${Math.floor(s / 60)}m to close`;
  if (s < 86400) return `${Math.floor(s / 3600)}h to close`;
  return `${Math.floor(s / 86400)}d to close`;
}

const Side = ({ name, right = false }: { name: string; right?: boolean }) => {
  const flag = flagUrl(name);
  const kit = <span className="sb-kit" style={{ background: kitColor(name) }} aria-hidden="true" />;
  const img = flag && <img className="sb-flag" src={flag} alt="" />;
  return (
    <div className={`sb-side ${right ? "r" : ""}`}>
      {right ? <><span className="sb-abbr">{teamAbbr(name)}</span>{img}{kit}</> : <>{kit}{img}<span className="sb-abbr">{teamAbbr(name)}</span></>}
    </div>
  );
};

interface Props {
  open: boolean;
  onClose: () => void;
  markets: MarketData[];
  onJump?: (m: MarketData) => void;
}

export function WorldMatches({ open, onClose, markets, onJump }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const now = Math.floor(Date.now() / 1000);
  const sorted = [...markets].sort((a, b) => {
    const ao = a.status === "open" && now < a.bettingCloseTs ? 0 : 1;
    const bo = b.status === "open" && now < b.bettingCloseTs ? 0 : 1;
    return ao - bo || a.bettingCloseTs - b.bettingCloseTs;
  });

  return (
    <div className="wm-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Markets around the world">
      <div className="wm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wm-head">
          <div>
            <h3>Around the world</h3>
            <p className="muted">Every match market and its 2026 host city. Tap to jump to it.</p>
          </div>
          <button className="wm-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="wm-list">
          {sorted.map((m) => {
            const live = m.status === "open" && now < m.bettingCloseTs;
            const terminal = m.status === "settled" || m.status === "voided";
            return (
              <button key={m.pubkey.toBase58()} className="wm-row" onClick={() => { onJump?.(m); onClose(); }}>
                <span className="wm-city">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                  {hostCity(m)}
                </span>
                <span className="wm-match">
                  <Side name={m.homeTeam} />
                  {terminal && m.resultVerified && m.finalOutcome < 3 ? (
                    <span className="sb-score tnum">{m.homeGoals}<i>:</i>{m.awayGoals}</span>
                  ) : (
                    <span className="sb-vs">VS</span>
                  )}
                  <Side name={m.awayTeam} right />
                </span>
                <span className={`wm-when ${live ? "live" : ""}`}>
                  {live && <span className="live-dot2" />}
                  {live ? `${toUi(m.totalPool).toLocaleString()} USDC` : whenLabel(m)}
                </span>
              </button>
            );
          })}
          {sorted.length === 0 && <p className="muted" style={{ padding: 16 }}>No markets yet.</p>}
        </div>
      </div>
    </div>
  );
}
