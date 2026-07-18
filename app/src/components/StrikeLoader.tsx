"use client";

import React, { useEffect, useRef, useState } from "react";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * "The Strike" loader: a ball traces a shot trajectory into the goal while a
 * counter races to 100, then a net-ripple flash and wipe up. Pure SVG/canvas,
 * deterministic. Once per session; reduced-motion skips.
 */
export function StrikeLoader() {
  const [pct, setPct] = useState(0);
  const [out, setOut] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scored, setScored] = useState(false);
  const ballRef = useRef<SVGCircleElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || sessionStorage.getItem("ph-intro")) {
      setHidden(true);
      return;
    }
    const path = pathRef.current;
    const trail = trailRef.current;
    const ball = ballRef.current;
    const L = path?.getTotalLength() ?? 0;
    if (trail) {
      trail.style.strokeDasharray = String(L);
      trail.style.strokeDashoffset = String(L);
    }

    const dur = 2400;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const pr = Math.min(1, (t - start) / dur);
      const e = easeOut(pr);
      setPct(Math.round(pr * 100));
      if (path && ball) {
        const pt = path.getPointAtLength(L * e);
        ball.setAttribute("cx", String(pt.x));
        ball.setAttribute("cy", String(pt.y));
      }
      if (trail) trail.style.strokeDashoffset = String(L * (1 - e));
      if (pr < 1) raf = requestAnimationFrame(step);
      else {
        setScored(true);
        setTimeout(() => setOut(true), 480);
        setTimeout(() => {
          setHidden(true);
          sessionStorage.setItem("ph-intro", "1");
        }, 1200);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (hidden) return null;

  return (
    <div className={`strike ${out ? "out" : ""} ${scored ? "goal" : ""}`} aria-hidden="true">
      <div className="ph-intro-grain" />
      <div className="strike-top">
        <span>WORLD CUP MARKETS®</span>
        <span className="ph-dim">WCM — 26</span>
      </div>

      <svg className="strike-svg" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet">
        {/* goal at the end of the arc */}
        <g className="strike-goal" transform="translate(812 214)">
          <path className="goal-frame" d="M2 2 H112 V150 H2 Z" />
          {[22, 42, 62, 82, 102].map((x) => <line key={x} className="goal-net" x1={x} y1={2} x2={x} y2={150} />)}
          {[30, 58, 86, 114].map((y) => <line key={y} className="goal-net" x1={2} y1={y} x2={112} y2={y} />)}
        </g>
        {/* faint dotted trajectory */}
        <path ref={pathRef} className="strike-ghost" d="M 130 500 Q 470 -70 868 300" fill="none" />
        {/* bright revealing trail */}
        <path ref={trailRef} className="strike-trail" d="M 130 500 Q 470 -70 868 300" fill="none" />
        {/* the ball */}
        <circle ref={ballRef} className="strike-ball" r="15" cx="130" cy="500" />
      </svg>

      <div className="strike-count">{String(pct).padStart(3, "0")}<em>%</em></div>
      <div className="pi-caption strike-cap">◇ {scored ? "GOAL — ENTER" : "THE STRIKE · LOADING"}</div>
      <div className="ph-intro-sound">◦ CLICK TO ENABLE SOUND</div>
      <div className="ph-intro-progress"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
