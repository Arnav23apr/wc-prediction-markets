"use client";

import React from "react";
import { MarketData, impliedPct, toUi } from "@/lib/markets";
import { flagUrl, teamAbbr } from "@/lib/flags";
import Typewriter from "@/components/Typewriter";
import dynamic from "next/dynamic";

const ParticleBall = dynamic(() => import("@/components/ParticleBall"), { ssr: false });

/**
 * Tournament banner: glass gradient panel with the brand line on the left and
 * up to two featured live match cards embedded on the right.
 */

interface Props {
  markets: MarketData[];
  onOpen: (m: MarketData) => void;
  onJump: () => void;
}

/** Magnetic pull: the button drifts toward the cursor, snapping back on leave.
 *  Direct DOM writes (no React state) keep it off the render path. */
const magnetMove = (e: React.PointerEvent<HTMLButtonElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  const mx = e.clientX - (r.left + r.width / 2);
  const my = e.clientY - (r.top + r.height / 2);
  e.currentTarget.style.transform = `translate(${(mx * 0.24).toFixed(1)}px, ${(my * 0.4).toFixed(1)}px)`;
};
const magnetLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
  e.currentTarget.style.transform = "";
};

export function FeaturedBanner({ markets, onOpen, onJump }: Props) {
  const now = Math.floor(Date.now() / 1000);
  const featured = markets
    .filter((m) => m.status === "open" && now < m.bettingCloseTs)
    .sort((a, b) => b.totalPool - a.totalPool)
    .slice(0, 2);

  const Mini = ({ m }: { m: MarketData }) => {
    const pct = impliedPct(m.pools);
    return (
      <div className="fb-card" onClick={() => onOpen(m)} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onOpen(m)}>
        <span className="fb-card-when" title={new Date(m.bettingCloseTs * 1000).toLocaleString()}>
          {(() => {
            const sec = m.bettingCloseTs - Math.floor(Date.now() / 1000);
            if (sec <= 0) return "closing";
            if (sec < 3600) return `closes in ${Math.max(1, Math.round(sec / 60))}m`;
            if (sec < 86400) return `closes in ${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
            return `closes in ${Math.floor(sec / 86400)}d`;
          })()}
        </span>
        {[{ t: m.homeTeam, p: pct[0] }, { t: m.awayTeam, p: pct[2] }].map((r) => (
          <div className="fb-card-row" key={r.t}>
            {flagUrl(r.t) ? <img src={flagUrl(r.t)!} alt="" /> : <span className="fb-flag-ph" />}
            <span>{r.t}</span>
            <b>{m.totalPool === 0 ? "new" : `${r.p.toFixed(0)}%`}</b>
          </div>
        ))}
        <div className="fb-card-chips">
          <span>{teamAbbr(m.homeTeam)}</span><span>Draw</span><span>{teamAbbr(m.awayTeam)}</span>
        </div>
        <span className="fb-card-vol">{toUi(m.totalPool).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC pool</span>
      </div>
    );
  };

  return (
    <section className="fb" aria-label="World Cup 2026 featured markets">
      <div className="fb-in">
        <div className="fb-art" aria-hidden="true" />
        <div className="fb-left">
          <span className="fb-kicker">WORLD CUP 2026 · JUNE 11 – JULY 19</span>
          <h2 className="fb-title">Bet the World Cup.<br /><em>Settled by proof.</em></h2>
          <div className="fb-sub">
            Pooled markets on every match. Results verified on-chain from TxLINE Merkle proofs.{" "}
            <Typewriter
              texts={["No oracle.", "No vote.", "No bookie.", "Just proof."]}
              prefix=""
              ease={{ duration: 0.055, delay: 1.4 }}
              deleteSpeed={0.03}
              showCursor
              hideCursorOnType={false}
              cursorChar="_"
              color="inherit"
              typedColor="#f7dca0"
              cursorColor="#ffc65c"
              style={{ display: "inline-flex", width: "auto", height: "auto" }}
            />
          </div>
          <button className="fb-cta" onClick={onJump} onPointerMove={magnetMove} onPointerLeave={magnetLeave}>
            View all markets
            <span className="fb-cta-orb" aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="fb-ball" aria-hidden="true">
          <ParticleBall
            particlesCount={5200}
            particleScale={3}
            speed={16}
            smoothing={7}
            scale={10}
            drag
            dragSpeed={5}
            cursorOn
            cursorRadiusUI={70}
            cursorStrengthUI={9}
            clickForce={5}
            sphereColor="#4a4c56"
            pentagonColor="#ffcf6b"
          />
        </div>
      </div>
    </section>
  );
}
