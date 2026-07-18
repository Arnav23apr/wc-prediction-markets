"use client";

import React, { useEffect, useRef, useState } from "react";

// material rotation loops, in morph order, + dithered ball as the "disperse" finale
const MATERIALS = [
  { webm: "/ballrot.webm", mp4: "/ballrot.mp4", name: "LEATHER" },
  { webm: "/ball-gold.webm", mp4: "/ball-gold.mp4", name: "GOLD" },
  { webm: "/ball-glass.webm", mp4: "/ball-glass.mp4", name: "GLASS" },
  { webm: "/ball-chrome.webm", mp4: "/ball-chrome.mp4", name: "CHROME" },
  { webm: "/ball.webm", mp4: "/ball.mp4", name: "DISPERSE" }, // dithered stipple
];
const PIXEL_DUR = 850; // ms of pixel-resolve
const PER_MAT = 900; // ms per material
const SCATTER = 800; // ms disperse finale

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function PhantomIntro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vidRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [count, setCount] = useState(0);
  const [label, setLabel] = useState(MATERIALS[0].name);
  const [out, setOut] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || sessionStorage.getItem("ph-intro")) {
      setHidden(true);
      return;
    }

    const N = MATERIALS.length; // 5 (last = dither)
    const morphEnd = PIXEL_DUR + (N - 1) * PER_MAT; // matFloat 0..N-1 (chrome->dither)
    const total = morphEnd + SCATTER;

    const img = new Image();
    let ready = false;
    img.onload = () => (ready = true);
    img.src = "/ball-full.png";
    const off = document.createElement("canvas");
    const octx = off.getContext("2d");

    const start = performance.now();
    let raf = 0;
    let lastLabel = -1;

    const step = (t: number) => {
      const el = t - start;
      const p = Math.min(1, el / total);
      setCount(Math.round(p * 100));

      const matFloat = (el - PIXEL_DUR) / PER_MAT; // 0..N-1
      const li = Math.max(0, Math.min(N - 1, Math.round(matFloat)));
      if (li !== lastLabel) {
        lastLabel = li;
        setLabel(MATERIALS[li].name);
      }

      // canvas pixel-resolve of leather during the first phase
      const cv = canvasRef.current;
      const ctx = cv?.getContext("2d");
      const canvasOp = el < PIXEL_DUR ? 1 : clamp01(1 - (el - PIXEL_DUR) / 200);
      if (cv) cv.style.opacity = String(canvasOp);
      if (canvasOp > 0 && ready && cv && ctx && octx) {
        const rp = clamp01(el / PIXEL_DUR);
        const d = Math.max(6, Math.round(6 + Math.pow(rp, 1.5) * 250));
        off.width = d;
        off.height = d;
        octx.imageSmoothingEnabled = false;
        octx.clearRect(0, 0, d, d);
        octx.drawImage(img, 0, 0, d, d);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(off, 0, 0, d, d, 0, 0, cv.width, cv.height);
      }

      // crossfade material layers by distance to matFloat
      const scatterT = el > morphEnd ? clamp01((el - morphEnd) / SCATTER) : 0;
      vidRefs.current.forEach((v, i) => {
        if (!v) return;
        let op = clamp01(1 - Math.abs(i - matFloat));
        if (el < PIXEL_DUR * 0.75) op = 0; // hidden while pixels resolve
        if (i === N - 1) {
          // dither finale disperses: scale up + fade
          v.style.transform = `translate(-50%,-50%) scale(${1 + scatterT * 0.7})`;
          op = clamp01(op) * (1 - scatterT);
          op = Math.max(op, (1 - Math.abs(i - matFloat)) * (1 - scatterT));
        }
        v.style.opacity = String(clamp01(op));
      });

      if (p < 1) raf = requestAnimationFrame(step);
      else {
        setTimeout(() => setOut(true), 120);
        setTimeout(() => {
          setHidden(true);
          sessionStorage.setItem("ph-intro", "1");
        }, 950);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (hidden) return null;

  return (
    <div className={`ph-intro ${out ? "out" : ""}`} aria-hidden="true">
      <div className="ph-intro-grain" />
      <div className="pm-stage">
        {MATERIALS.map((m, i) => (
          <video
            key={i}
            ref={(el) => { vidRefs.current[i] = el; }}
            className={`pm-vid${i === MATERIALS.length - 1 ? " pm-dither" : ""}`}
            autoPlay muted loop playsInline preload="auto"
            style={{ opacity: 0 }}
          >
            <source src={m.webm} type="video/webm" />
            <source src={m.mp4} type="video/mp4" />
          </video>
        ))}
        <canvas ref={canvasRef} className="pm-canvas" width={380} height={380} />
      </div>

      <div className="ph-intro-labels">
        <span className="l">WORLD CUP MARKETS®</span>
        <span className="r">SETTLED BY PROOF</span>
      </div>
      <div className="pi-caption">◇ MATCH BALL — {label}</div>
      <div className="ph-intro-sound">◦ {count >= 100 ? "CLICK TO ENTER" : "CLICK TO ENABLE SOUND"}</div>
      <div className="ph-intro-progress"><span style={{ width: `${count}%` }} /></div>
    </div>
  );
}
