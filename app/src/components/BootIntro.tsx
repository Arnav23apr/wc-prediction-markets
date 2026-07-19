"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const ParticleBall = dynamic(() => import("@/components/ParticleBall"), { ssr: false });

/**
 * Boot intro: the particle football assembles from scattered particles at
 * screen center, then flies and scales into the hero's ball slot (`.fb-ball`)
 * while the dark cover and wordmark fade — so the intro ball "implants" itself
 * into the page, handing off to the identical live hero ball beneath it.
 * Plays once per session; reduced-motion skips straight to the app.
 *
 * Fades are driven by inline state (not class-descendant CSS) so the handoff is
 * deterministic regardless of styled-jsx scoping.
 */
export function BootIntro() {
  const [gone, setGone] = useState(false);
  const [implanting, setImplanting] = useState(false);
  const [wordIn, setWordIn] = useState(false);
  const ballRef = useRef<HTMLDivElement>(null);
  const [xform, setXform] = useState<string>();

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || sessionStorage.getItem("seen-intro")) {
      setGone(true);
      return;
    }

    const tWord = setTimeout(() => setWordIn(true), 450);

    // once the ball has assembled, measure the hero slot and fly into it
    const tImplant = setTimeout(() => {
      const src = ballRef.current?.getBoundingClientRect();
      const dst = document.querySelector(".fb-ball")?.getBoundingClientRect();
      if (src && dst && dst.height > 4) {
        const sCx = src.left + src.width / 2;
        const sCy = src.top + src.height / 2;
        const dCx = dst.left + dst.width / 2;
        const dCy = dst.top + dst.height / 2;
        const s = dst.height / src.height; // match the circular ball's diameter
        setXform(`translate(${(dCx - sCx).toFixed(1)}px, ${(dCy - sCy).toFixed(1)}px) scale(${s.toFixed(3)})`);
      }
      setImplanting(true);
    }, 1650);

    const tGone = setTimeout(() => {
      setGone(true);
      sessionStorage.setItem("seen-intro", "1");
    }, 2650);

    return () => {
      clearTimeout(tWord);
      clearTimeout(tImplant);
      clearTimeout(tGone);
    };
  }, []);

  if (gone) return null;

  return (
    <div className="bx" aria-hidden="true" style={{ pointerEvents: implanting ? "none" : "auto" }}>
      <div className="bx-bg" style={{ opacity: implanting ? 0 : 1 }} />
      <div className="bx-ball" ref={ballRef} style={xform ? { transform: xform } : undefined}>
        <ParticleBall
          particlesCount={5200}
          particleScale={3}
          speed={18}
          smoothing={7}
          scale={10}
          drag={false}
          cursorOn
          cursorRadiusUI={0}
          cursorStrengthUI={0}
          clickForce={0}
          assemble
          sphereColor="#4a4c56"
          pentagonColor="#ffcf6b"
        />
      </div>
      <div
        className="bx-word"
        style={{
          opacity: implanting ? 0 : wordIn ? 1 : 0,
          transform: wordIn && !implanting ? "translateY(0)" : "translateY(8px)",
        }}
      >
        MARKETS<span>settled by proof</span>
      </div>
      <style jsx>{`
        .bx {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: grid;
          place-items: center;
        }
        .bx-bg {
          position: absolute;
          inset: 0;
          background: #08090c;
          transition: opacity 0.8s ease;
        }
        .bx-ball {
          position: relative;
          width: 340px;
          height: 340px;
          transform-origin: center center;
          transition: transform 1s cubic-bezier(0.62, 0, 0.16, 1);
          will-change: transform;
        }
        .bx-word {
          position: absolute;
          bottom: 15%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          font-family: var(--sans, ui-sans-serif), system-ui, sans-serif;
          font-weight: 700;
          font-size: 21px;
          letter-spacing: 0.03em;
          color: #eef0f3;
          transition: opacity 0.5s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .bx-word span {
          font-family: var(--mono, ui-monospace), monospace;
          font-weight: 500;
          font-size: 10.5px;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: #ffc65c;
        }
        @media (max-width: 640px) {
          .bx-ball {
            width: 260px;
            height: 260px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .bx {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
