"use client";

import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * THE SETTLEMENT JOURNEY — a scroll-scrubbed film. A Higgsfield-generated
 * clip sliced into 97 webp frames (~1.4MB); scroll position drives the frame,
 * so the film plays exactly as fast as the reader scrolls. Frames only load
 * when the section approaches (IntersectionObserver) to protect page load.
 */

const FRAME_COUNT = 97;
const framePath = (i: number) => `/scrub/frame-${String(i + 1).padStart(4, "0")}.webp`;

const STEPS = [
  { at: 0.04, n: "01", kicker: "THE MATCH", text: "Ninety minutes. One result. TxODDS scouts record every stat as it happens." },
  { at: 0.3, n: "02", kicker: "THE PROOF", text: "The final score is sealed into a Merkle tree, its root anchored on Solana." },
  { at: 0.56, n: "03", kicker: "THE CHECK", text: "Anyone submits the proof. The program verifies it on-chain. No oracle. No vote." },
  { at: 0.82, n: "04", kicker: "THE PAYOUT", text: "The vault opens itself. Winners paid pro-rata, voids refunded. Settled by proof." },
];

export function ScrubStory() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const frameRef = useRef(0);
  const [armed, setArmed] = useState(false);   // section approached → load frames
  const [ready, setReady] = useState(false);   // all frames decoded
  const [progress, setProgress] = useState(0);

  // arm when the section is within a viewport of entering
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && setArmed(true),
      { rootMargin: "100% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!armed) return;
    let done = 0;
    imagesRef.current = Array.from({ length: FRAME_COUNT }, (_, i) => {
      const img = new Image();
      img.src = framePath(i);
      const bump = () => { done += 1; if (done === FRAME_COUNT) setReady(true); };
      img.onload = bump;
      img.onerror = bump;
      return img;
    });
  }, [armed]);

  const draw = (index: number) => {
    const canvas = canvasRef.current;
    const img = imagesRef.current[Math.min(FRAME_COUNT - 1, Math.max(0, index))];
    if (!canvas || !img || !img.naturalWidth) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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
    // layout below this section changes once it mounts fully
    const t = setTimeout(() => ScrollTrigger.refresh(), 400);

    return () => {
      st.kill();
      clearTimeout(t);
      window.removeEventListener("resize", resize);
    };
  }, [ready]);

  const activeIdx = STEPS.reduce((acc, s, i) => (progress >= s.at ? i : acc), -1);

  return (
    <section className="scrub-wrap story" ref={wrapRef} aria-label="How settlement works, as a scroll-driven film">
      <div className="scrub-stage">
        <canvas ref={canvasRef} className="scrub-canvas" />
        <div className="scrub-vignette" aria-hidden="true" />
        <div className="scrub-edge top" aria-hidden="true" />
        <div className="scrub-edge bot" aria-hidden="true" />

        {/* title moment at rest */}
        <div className={`scrub-title ${progress > 0.03 ? "gone" : ""}`}>
          <span className="kicker">// THE SETTLEMENT JOURNEY</span>
          <h2>FROM FULL TIME<br />TO PAID OUT.</h2>
          <span className="scrub-cue-inline">SCROLL TO SCRUB THE FILM</span>
        </div>

        {STEPS.map((s, i) => {
          const next = STEPS[i + 1]?.at ?? 1.05;
          const active = progress >= s.at && progress < next && progress > 0.03;
          return (
            <div key={s.n} className={`scrub-step ${active ? "on" : ""}`}>
              <span className="scrub-kicker">{s.n} · {s.kicker}</span>
              <p>{s.text}</p>
            </div>
          );
        })}

        {/* step rail */}
        <div className="scrub-railv" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.n} className={`scrub-railv-n ${i === activeIdx ? "on" : ""}`}>{s.n}</span>
          ))}
        </div>

        {!ready && armed && <div className="scrub-mini-load" aria-hidden="true">LOADING FILM…</div>}
      </div>
    </section>
  );
}
