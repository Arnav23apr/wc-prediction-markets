"use client";

import React, { useEffect, useRef, useState } from "react";

const LEADERBOARD = [
  { c: "🇦🇷", n: "MESSI", p: 999 }, { c: "🇧🇷", n: "RONALDO", p: 940 },
  { c: "🇵🇹", n: "CR7", p: 921 }, { c: "🇫🇷", n: "MBAPPE", p: 880 },
  { c: "🇳🇴", n: "HAALAND", p: 845 }, { c: "🇧🇪", n: "DBRUYNE", p: 790 },
  { c: "🇪🇬", n: "SALAH", p: 760 }, { c: "🇵🇱", n: "LEWa", p: 720 },
  { c: "🇭🇷", n: "MODRIC", p: 690 }, { c: "🇺🇾", n: "SUAREZ", p: 640 },
];

const GAME_SECONDS = 30;

interface Ball { x: number; y: number; vx: number; vy: number; flying: boolean; }

/** Original football shooting mini-game: drag the ball to aim + power, beat the
 *  keeper into the goal, build a combo before the clock runs out. */
export function ShootGame({ open, onClose }: { open: boolean; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(1);
  const [time, setTime] = useState(GAME_SECONDS);
  const [flash, setFlash] = useState<null | "GOAL!" | "SAVED" | "MISS">(null);
  const [over, setOver] = useState(false);

  const state = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 0, H = 0, dpr = 1;

    const S = {
      ball: { x: 0, y: 0, vx: 0, vy: 0, flying: false } as Ball,
      keeper: { x: 0, dir: 1, speed: 2.6 },
      aim: null as null | { x: number; y: number },
      goal: { y: 0, x1: 0, x2: 0, postH: 0 },
      score: 0, combo: 1, resolving: false, startX: 0, startY: 0, r: 22,
      startAt: performance.now(), running: true,
    };
    state.current = S;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mouth = Math.min(360, W * 0.34);
      S.goal = { y: H * 0.26, x1: W / 2 - mouth / 2, x2: W / 2 + mouth / 2, postH: 96 };
      S.startX = W / 2; S.startY = H * 0.8;
      if (!S.ball.flying) { S.ball.x = S.startX; S.ball.y = S.startY; }
      S.keeper.x = W / 2;
    };
    resize();
    window.addEventListener("resize", resize);

    const resetBall = () => {
      S.ball = { x: S.startX, y: S.startY, vx: 0, vy: 0, flying: false };
      S.resolving = false;
    };

    const resolve = (kind: "GOAL!" | "SAVED" | "MISS") => {
      if (S.resolving) return;
      S.resolving = true;
      setFlash(kind);
      setTimeout(() => setFlash(null), 700);
      if (kind === "GOAL!") {
        S.score += 100 * S.combo;
        S.combo = Math.min(9, S.combo + 1);
      } else {
        S.combo = 1;
      }
      setScore(S.score); setCombo(S.combo);
      setTimeout(resetBall, 650);
    };

    // input (slingshot: drag away from ball, release to launch toward goal)
    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const down = (e: PointerEvent) => {
      if (S.ball.flying || S.resolving || over) return;
      S.aim = pos(e);
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => { if (S.aim) S.aim = pos(e); };
    const up = () => {
      if (!S.aim) return;
      const dx = S.startX - S.aim.x;
      const dy = S.startY - S.aim.y;
      const power = Math.min(1, Math.hypot(dx, dy) / 260);
      if (power > 0.08) {
        S.ball.vx = dx * 0.16;
        S.ball.vy = dy * 0.16;
        S.ball.flying = true;
      }
      S.aim = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    const drawBall = (x: number, y: number, r: number) => {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,0.75)";
      // little pentagon panels
      ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, Math.PI * 2); ctx.fillStyle = "#0b0d12"; ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42);
        ctx.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
        ctx.stroke();
      }
      ctx.restore();
    };

    const loop = () => {
      // time
      const el = (performance.now() - S.startAt) / 1000;
      const left = Math.max(0, GAME_SECONDS - el);
      setTime(Math.ceil(left));
      if (left <= 0 && !over) { setOver(true); S.running = false; }

      // keeper patrol
      const krange = (S.goal.x2 - S.goal.x1) / 2 - 40;
      S.keeper.x += S.keeper.dir * S.keeper.speed;
      if (S.keeper.x > W / 2 + krange || S.keeper.x < W / 2 - krange) S.keeper.dir *= -1;

      // ball physics
      const b = S.ball;
      if (b.flying) {
        b.vy += 0.42; // gravity
        b.x += b.vx; b.y += b.vy;
        // crossing goal plane going up
        if (b.y <= S.goal.y && b.vy < 0 && !S.resolving) {
          const inMouth = b.x > S.goal.x1 + 6 && b.x < S.goal.x2 - 6;
          const saved = Math.abs(b.x - S.keeper.x) < 44 + S.r;
          if (inMouth && !saved) resolve("GOAL!");
          else if (inMouth && saved) resolve("SAVED");
        }
        if ((b.y > H + 60 || b.x < -60 || b.x > W + 60) && !S.resolving) resolve("MISS");
      }

      // ---- draw ----
      ctx.clearRect(0, 0, W, H);
      // ground line
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, S.startY + S.r + 8); ctx.lineTo(W, S.startY + S.r + 8); ctx.stroke();

      // goal (posts + crossbar + net)
      const g = S.goal;
      ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(g.x1, g.y + g.postH); ctx.lineTo(g.x1, g.y); ctx.lineTo(g.x2, g.y); ctx.lineTo(g.x2, g.y + g.postH);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 1;
      for (let x = g.x1; x <= g.x2; x += 22) { ctx.beginPath(); ctx.moveTo(x, g.y); ctx.lineTo(x, g.y + g.postH); ctx.stroke(); }
      for (let y = g.y; y <= g.y + g.postH; y += 20) { ctx.beginPath(); ctx.moveTo(g.x1, y); ctx.lineTo(g.x2, y); ctx.stroke(); }

      // keeper
      ctx.fillStyle = "rgba(245,158,11,0.16)"; ctx.strokeStyle = "var(--gold)";
      ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(S.keeper.x - 30, g.y + 10, 60, g.postH - 4, 8); ctx.fill(); ctx.stroke();

      // aim guide + trajectory preview
      if (S.aim && !b.flying) {
        const dx = S.startX - S.aim.x, dy = S.startY - S.aim.y;
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.setLineDash([3, 8]); ctx.lineWidth = 2;
        let px = S.startX, py = S.startY, pvx = dx * 0.16, pvy = dy * 0.16;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let i = 0; i < 40; i++) { pvy += 0.42; px += pvx; py += pvy; ctx.lineTo(px, py); if (py > H) break; }
        ctx.stroke(); ctx.setLineDash([]);
        // power line
        ctx.strokeStyle = "rgba(251,191,36,0.7)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(S.startX, S.startY); ctx.lineTo(S.aim.x, S.aim.y); ctx.stroke();
      }

      drawBall(b.x, b.y, S.r);

      if (S.running) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const restart = () => {
    setScore(0); setCombo(1); setTime(GAME_SECONDS); setOver(false); setFlash(null);
    if (state.current) {
      state.current.score = 0; state.current.combo = 1;
      state.current.startAt = performance.now(); state.current.running = true;
      state.current.ball = { x: state.current.startX, y: state.current.startY, vx: 0, vy: 0, flying: false };
    }
  };

  if (!open) return null;
  const mm = Math.floor(time / 60);
  const ss = String(time % 60).padStart(2, "0");

  return (
    <div className="game-overlay">
      <canvas ref={canvasRef} className="game-canvas" />
      <button className="game-close" onClick={onClose} data-no-sfx>CLOSE GAME [ESC]</button>
      <div className="game-hud">
        <span>◦ {mm}:{ss}</span>
        <span className="g-score">{String(score).padStart(4, "0")} PTS</span>
        <span className="g-combo">{combo}×</span>
        <span className="g-tip">DRAG THE BALL · AIM · RELEASE</span>
      </div>
      <div className="game-lb">
        <div className="game-lb-h">LEADERBOARD</div>
        <div className="game-lb-row me"><span>{score >= 999 ? "🏆" : "🎯"} YOU</span><span>{score} pts</span></div>
        {LEADERBOARD.map((r) => (
          <div className="game-lb-row" key={r.n}><span>{r.c} {r.n}</span><span>{r.p} pts</span></div>
        ))}
      </div>
      {flash && <div className={`game-flash ${flash === "GOAL!" ? "goal" : ""}`}>{flash}</div>}
      {over && (
        <div className="game-over">
          <div className="go-title">FULL TIME</div>
          <div className="go-score">{score} PTS</div>
          <div className="go-actions">
            <button className="ph-pill" onClick={restart}>Play again</button>
            <button className="game-close-2" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
