"use client";

import React, { useEffect, useState } from "react";

/**
 * A quick branded "kickoff" intro that wipes away on first load (once per
 * session). Respects reduced-motion by skipping straight to the app.
 */
export function Preloader() {
  const [out, setOut] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || sessionStorage.getItem("seen-intro")) {
      setHidden(true);
      return;
    }
    const t1 = setTimeout(() => setOut(true), 1150);
    const t2 = setTimeout(() => {
      setHidden(true);
      sessionStorage.setItem("seen-intro", "1");
    }, 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (hidden) return null;

  return (
    <div className={`preloader ${out ? "out" : ""}`} aria-hidden="true">
      <div className="pre-inner">
        <div className="pre-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        </div>
        <div className="pre-word">WORLD CUP MARKETS</div>
        <div className="pre-bar"><span /></div>
      </div>
    </div>
  );
}
