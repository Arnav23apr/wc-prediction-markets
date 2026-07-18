"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { MarketData, statusLabel, toUi } from "@/lib/markets";
import { flagUrl, teamAbbr, kitColor } from "@/lib/flags";

/**
 * Phantom-style curved 3D wall: a horizontally drag/scroll-able coverflow of
 * market tiles. Each tile's rotateY/scale/opacity is derived from its distance
 * to the stage centre, so the row reads as a cylinder you spin through.
 */
export function CurvedWall({ markets, onSelect }: { markets: MarketData[]; onSelect: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const update = useCallback(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!stage || !track) return;
    const sc = stage.getBoundingClientRect();
    const center = sc.left + sc.width / 2;
    Array.from(track.children).forEach((node) => {
      const el = node as HTMLElement;
      const r = el.getBoundingClientRect();
      const tc = r.left + r.width / 2;
      const d = Math.max(-1.5, Math.min(1.5, (tc - center) / (sc.width / 2)));
      const rot = d * -34;
      const scale = 1 - Math.min(0.3, Math.abs(d) * 0.22);
      const tz = -Math.abs(d) * 90;
      el.style.transform = `translateZ(${tz}px) rotateY(${rot}deg) scale(${scale})`;
      el.style.opacity = String(1 - Math.min(0.62, Math.abs(d) * 0.52));
      el.style.zIndex = String(200 - Math.round(Math.abs(d) * 100));
      el.classList.toggle("focus", Math.abs(d) < 0.3);
    });
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    const t = setTimeout(() => {
      track.scrollLeft = (track.scrollWidth - track.clientWidth) / 2;
      update();
    }, 60);
    return () => {
      track.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [update, markets.length]);

  // drag + horizontal wheel
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let down = false;
    let startX = 0;
    let startLeft = 0;
    let moved = 0;
    const pd = (e: PointerEvent) => {
      down = true;
      startX = e.clientX;
      startLeft = track.scrollLeft;
      moved = 0;
      track.classList.add("drag");
    };
    const pm = (e: PointerEvent) => {
      if (!down) return;
      moved = Math.abs(e.clientX - startX);
      track.scrollLeft = startLeft - (e.clientX - startX);
    };
    const pu = () => {
      down = false;
      track.classList.remove("drag");
    };
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) track.scrollLeft += e.deltaY;
    };
    // block click after a drag
    const onClickCapture = (e: MouseEvent) => {
      if (moved > 6) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    track.addEventListener("pointerdown", pd);
    track.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    track.addEventListener("wheel", wheel, { passive: true });
    track.addEventListener("click", onClickCapture, true);
    return () => {
      track.removeEventListener("pointerdown", pd);
      track.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      track.removeEventListener("wheel", wheel);
      track.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  if (markets.length === 0) return null;

  return (
    <div className="cw-wrap">
      <div className="cw-head">
        <span>◇ FEATURED MARKETS — DRAG TO EXPLORE</span>
        <span>{markets.length} MARKETS</span>
      </div>
      <div className="cw-stage" ref={stageRef}>
        <div className="cw-track" ref={trackRef} data-lenis-prevent>
          {markets.map((m) => {
            const terminal = m.status === "settled" || m.status === "voided";
            const score = terminal && m.resultVerified && m.finalOutcome < 3 ? `${m.homeGoals}:${m.awayGoals}` : "VS";
            const hf = flagUrl(m.homeTeam);
            const af = flagUrl(m.awayTeam);
            return (
              <button key={m.pubkey.toBase58()} className="cw-tile" onClick={onSelect}>
                <div className="cw-tile-top">
                  <span className={`cw-status s-${m.status}`}>{statusLabel(m.status)}</span>
                  <span className="cw-pool">{toUi(m.totalPool).toLocaleString()} USDC</span>
                </div>
                <div className="cw-teams">
                  <span className="cw-team">
                    <span className="cw-kit" style={{ background: kitColor(m.homeTeam) }} />
                    {hf && <img src={hf} alt="" />}
                    <b>{teamAbbr(m.homeTeam)}</b>
                  </span>
                  <span className="cw-vs">{score}</span>
                  <span className="cw-team r">
                    <b>{teamAbbr(m.awayTeam)}</b>
                    {af && <img src={af} alt="" />}
                    <span className="cw-kit" style={{ background: kitColor(m.awayTeam) }} />
                  </span>
                </div>
                <div className="cw-names">{m.homeTeam} · {m.awayTeam}</div>
                <div className="cw-foot">
                  <span>{m.numBettors} BETTORS</span>
                  <span>OPEN ›</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
