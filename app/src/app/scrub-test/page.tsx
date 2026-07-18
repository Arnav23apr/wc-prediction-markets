"use client";

/**
 * TEST ROUTE — scroll-scrubbed cinematic sequence (the Apple technique).
 * A Higgsfield-generated clip sliced into frames; scrolling scrubs the film
 * while the settlement story annotates. If this lands, it becomes the
 * "settlement journey" section on the landing page.
 */

import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const FRAME_COUNT = Number(process.env.NEXT_PUBLIC_SCRUB_FRAMES ?? 97);
const framePath = (i: number) => `/scrub/frame-${String(i + 1).padStart(4, "0")}.webp`;

const STEPS = [
  { at: 0.05, kicker: "01 · THE MATCH", text: "Ninety minutes. One result. TxODDS scouts record every stat as it happens." },
  { at: 0.32, kicker: "02 · THE PROOF", text: "The final score is sealed into a Merkle tree, its root anchored on Solana." },
  { at: 0.58, kicker: "03 · THE CHECK", text: "Anyone submits the proof. The program verifies it on-chain. No oracle. No vote." },
  { at: 0.84, kicker: "04 · THE PAYOUT", text: "The vault opens itself. Winners paid pro-rata, voids refunded. Settled by proof." },
];

export default function ScrubTest() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const frameRef = useRef(0);
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);

  // Preload every frame.
  useEffect(() => {
    let done = 0;
    imagesRef.current = Array.from({ length: FRAME_COUNT }, (_, i) => {
      const img = new Image();
      img.src = framePath(i);
      const bump = () => {
        done += 1;
        setLoaded(done);
        if (done === FRAME_COUNT) setReady(true);
      };
      img.onload = bump;
      img.onerror = bump;
      return img;
    });
  }, []);

  const draw = (index: number) => {
    const canvas = canvasRef.current;
    const img = imagesRef.current[Math.min(FRAME_COUNT - 1, Math.max(0, index))];
    if (!canvas || !img || !img.naturalWidth) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // cover-fit
    const cw = canvas.width, ch = canvas.height;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.fillStyle = "#08090c";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  };

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    gsap.registerPlugin(ScrollTrigger);

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      draw(frameRef.current);
    };
    resize();
    window.addEventListener("resize", resize);

    const st = ScrollTrigger.create({
      trigger: wrap,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        const idx = Math.round(self.progress * (FRAME_COUNT - 1));
        setProgress(self.progress);
        if (idx !== frameRef.current) {
          frameRef.current = idx;
          requestAnimationFrame(() => draw(idx));
        }
      },
    });
    draw(0);

    return () => {
      st.kill();
      window.removeEventListener("resize", resize);
    };
  }, [ready]);

  return (
    <main style={{ maxWidth: "none", padding: 0 }}>
      {!ready && (
        <div className="scrub-loading">
          <span className="hp-tag">LOADING FILM</span>
          <div className="scrub-loadbar"><i style={{ width: `${(loaded / FRAME_COUNT) * 100}%` }} /></div>
          <span className="scrub-loadnum">{loaded} / {FRAME_COUNT}</span>
        </div>
      )}

      <div className="scrub-wrap" ref={wrapRef}>
        <div className="scrub-stage">
          <canvas ref={canvasRef} className="scrub-canvas" />
          <div className="scrub-vignette" aria-hidden="true" />
          <div className="scrub-head">
            <span className="kicker">// SETTLEMENT, SCRUBBED</span>
            <span className="scrub-pct">{Math.round(progress * 100)}%</span>
          </div>
          {STEPS.map((s, i) => {
            const next = STEPS[i + 1]?.at ?? 1.05;
            const active = progress >= s.at && progress < next;
            return (
              <div key={s.kicker} className={`scrub-step ${active ? "on" : ""}`}>
                <span className="scrub-kicker">{s.kicker}</span>
                <p>{s.text}</p>
              </div>
            );
          })}
          <div className="scrub-cue" aria-hidden="true">SCROLL TO SCRUB</div>
        </div>
      </div>

      <section className="scrub-after">
        <h2>That&apos;s the technique.</h2>
        <p>The film only moves when you do. Imagine this as the settlement story on the landing page.</p>
      </section>
    </main>
  );
}
