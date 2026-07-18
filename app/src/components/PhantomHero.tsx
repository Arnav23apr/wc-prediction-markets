"use client";

import React, { useEffect, useState } from "react";
import { initSound, isMuted, setMuted, playTick, playClick } from "@/lib/sound";
import { DataViz } from "@/components/DataViz";

const PIPELINE = ["Commit", "Dispute", "Verify", "Finalize", "Claim"];

export interface Featured {
  homeTeam: string;
  awayTeam: string;
  home: number; // implied prob 0..1
  draw: number;
  away: number;
  pool: number;
  bettors: number;
  kickoffTs: number;
  live: boolean;
  score: string | null;
}

function useUtcClock() {
  const [t, setT] = useState("00:00:00");
  useEffect(() => {
    const tick = () => setT(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

interface Props {
  walletButton: React.ReactNode;
  balance: number | null;
  featured: Featured | null;
  onWorld: () => void;
  onHowItWorks: () => void;
  onPlay: () => void;
}

function countdown(ts: number): string {
  const s = ts - Math.floor(Date.now() / 1000);
  if (s <= 0) return "LIVE";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function PhantomHero({ walletButton, balance, featured, onWorld, onHowItWorks, onPlay }: Props) {
  const clock = useUtcClock();
  const [active, setActive] = useState(0);
  const [muted, setMutedState] = useState(true);
  const [tab, setTab] = useState<"markets" | "settlement">("markets");

  useEffect(() => {
    initSound();
    setMutedState(isMuted());
    const id = setInterval(() => setActive((a) => (a + 1) % PIPELINE.length), 2000);
    const onDown = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest("button, [role='button']");
      if (!btn || btn.hasAttribute("data-no-sfx") || (btn as HTMLButtonElement).disabled) return;
      playClick();
    };
    document.addEventListener("pointerdown", onDown, { capture: true });
    return () => {
      clearInterval(id);
      document.removeEventListener("pointerdown", onDown, { capture: true } as any);
    };
  }, []);

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playTick();
  };

  return (
    <section className="ph-hero">
      {/* ---------- top HUD ---------- */}
      <header className="ph-top">
        <div className="ph-top-l">
          <span className="ph-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </span>
          <div className="ph-seg">
            <button className={tab === "markets" ? "on" : ""} onClick={() => setTab("markets")}>Markets</button>
            <button className={tab === "settlement" ? "on" : ""} onClick={() => { setTab("settlement"); onHowItWorks(); }}>Settlement</button>
          </div>
        </div>

        <div className="ph-mission">
          <span className="ph-dim">[ WCM — 26 ]</span>
          <span>World Cup Markets is a trustless parimutuel exchange settling every match from verifiable TxLINE Merkle proofs.</span>
        </div>

        <div className="ph-hud">
          <span><i className="ph-dot" /> SOLANA · DEVNET</span>
          <span><i className="ph-dot live" /> LIVE&nbsp;&nbsp;{clock} UTC</span>
        </div>

        <div className="ph-top-r">
          <button className="ph-sound" onClick={toggleSound} data-no-sfx>SOUND [{muted ? "OFF" : "ON"}]</button>
          {balance !== null && (
            <span className="ph-bal">{balance.toLocaleString(undefined, { maximumFractionDigits: 1 })} USDC</span>
          )}
          <span className="ph-wallet">{walletButton}</span>
        </div>
      </header>

      {/* ---------- headline ---------- */}
      <div className="ph-headline">
        <span className="ph-eyebrow">◇ WORLD CUP 2026 — NO ORACLE, NO TRUST</span>
        <h1>Bet the World Cup.<br /><span className="ph-accent">Settled by proof.</span></h1>
      </div>

      {/* ---------- dithered rotating match ball ---------- */}
      <div className="ph-orbit">
        <DataViz home={featured?.home ?? 0.34} draw={featured?.draw ?? 0.33} away={featured?.away ?? 0.33} />
        <video className="orbit-ball" autoPlay muted loop playsInline poster="/ball-poster.png" preload="auto">
          <source src="/ballrot.webm" type="video/webm" />
          <source src="/ballrot.mp4" type="video/mp4" />
        </video>
        {featured && (
          <div className="orbit-match">{featured.homeTeam} <i>·</i> {featured.awayTeam}</div>
        )}
        {featured && (
          <div className="orbit-odds">
            <span className="o-h"><b>{Math.round(featured.home * 100)}</b>% HOME</span>
            <span className="o-d"><b>{Math.round(featured.draw * 100)}</b>% DRAW</span>
            <span className="o-a"><b>{Math.round(featured.away * 100)}</b>% AWAY</span>
          </div>
        )}
        {featured && (
          <div className="orbit-meta">
            <span className={featured.live ? "live" : ""}>{featured.live ? "● LIVE" : `◦ ${countdown(featured.kickoffTs)} TO KO`}</span>
            <span>{Math.round(featured.pool).toLocaleString()} USDC</span>
            <span>{featured.bettors} BETTORS</span>
          </div>
        )}
        <button className="ph-play" onClick={onPlay}>▶ SHOOT — PLAY</button>
      </div>

      {/* ---------- settlement pipeline ---------- */}
      <div className="ph-pipeline" aria-hidden="true">
        <span className="ph-pipeline-label">SETTLEMENT</span>
        {PIPELINE.map((s, i) => (
          <div key={s} className={`ph-stage ${i === active ? "on" : ""}`}>
            <span className="ph-stage-name">{s}</span>
            <sup>{String(i + 1).padStart(2, "0")}</sup>
          </div>
        ))}
      </div>

      {/* ---------- bottom nav ---------- */}
      <nav className="ph-nav">
        <button className="on">Markets</button>
        <button onClick={onWorld}>Worldwide</button>
        <button onClick={onHowItWorks}>Proof</button>
      </nav>

      <button className="ph-scroll" onClick={() => document.getElementById("markets-grid")?.scrollIntoView({ behavior: "smooth" })} aria-label="Scroll to markets">
        SCROLL
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </section>
  );
}
