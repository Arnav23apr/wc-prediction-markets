"use client";

import React, { useEffect, useRef } from "react";

interface Props {
  home: number; // 0..1
  draw: number;
  away: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Generative "odds as art": a live probability donut (Home/Draw/Away) with a
 * rotating tick gauge and breathing rings, driven by the real parimutuel pool.
 * Pure canvas 2D — reliable, no 3D.
 */
export function DataViz({ home, draw, away }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ home, draw, away });
  target.current = { home, draw, away };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 0, H = 0, dpr = 1;
    const cur = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
    let t = 0;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const GOLD = "#fbbf24", MUT = "#5f6b80", WHITE = "#e9edf5";

    const draw2 = () => {
      t += 0.016;
      cur.home = lerp(cur.home, target.current.home, 0.05);
      cur.draw = lerp(cur.draw, target.current.draw, 0.05);
      cur.away = lerp(cur.away, target.current.away, 0.05);
      const sum = cur.home + cur.draw + cur.away || 1;
      const segs = [
        { v: cur.home / sum, c: GOLD },
        { v: cur.draw / sum, c: MUT },
        { v: cur.away / sum, c: WHITE },
      ];

      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) * 0.46;

      // outer rotating dashed ring
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(t * 0.06);
      ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 1;
      ctx.setLineDash([2, 10]);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // tick gauge
      ctx.save(); ctx.translate(cx, cy);
      const ticks = 72;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2 + t * 0.05;
        const big = i % 6 === 0;
        const r1 = R * 0.86, r2 = R * (big ? 0.79 : 0.83);
        ctx.strokeStyle = big ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();

      // probability donut
      const donutR = R * 0.66;
      const breathe = 1 + Math.sin(t * 1.2) * 0.015;
      let ang = -Math.PI / 2;
      const gap = 0.05;
      ctx.save(); ctx.translate(cx, cy);
      segs.forEach((s) => {
        const sweep = s.v * (Math.PI * 2) - gap;
        ctx.beginPath();
        ctx.strokeStyle = s.c;
        ctx.lineWidth = R * 0.05 * breathe;
        ctx.lineCap = "round";
        ctx.shadowColor = s.c; ctx.shadowBlur = s.c === GOLD ? 16 : 6;
        ctx.arc(0, 0, donutR, ang + gap / 2, ang + gap / 2 + Math.max(0, sweep));
        ctx.stroke();
        ang += s.v * (Math.PI * 2);
      });
      ctx.shadowBlur = 0;
      ctx.restore();

      raf = requestAnimationFrame(draw2);
    };
    raf = requestAnimationFrame(draw2);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} className="dataviz-canvas" />;
}
