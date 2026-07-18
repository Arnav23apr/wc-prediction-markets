"use client";

import React, { useEffect, useState } from "react";

/**
 * Terminal boot intro: mono log lines cascade in, the wordmark slams, the
 * curtain lifts to reveal the page already settled beneath it. All timing is
 * CSS keyframes with fixed delays (no tween library, nothing to desync).
 * Plays once per session; reduced-motion skips straight to the app.
 */

const LINES = [
  "wc://markets · settlement engine",
  "connecting solana devnet ............ ok",
  "verifying TxLINE merkle root ........ ok",
  "no trusted oracle required .......... ok",
];

export function BootIntro() {
  const [gone, setGone] = useState(false);
  const [out, setOut] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || sessionStorage.getItem("seen-intro")) {
      setGone(true);
      return;
    }
    const t1 = setTimeout(() => setOut(true), 2350);
    const t2 = setTimeout(() => {
      setGone(true);
      sessionStorage.setItem("seen-intro", "1");
    }, 3150);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (gone) return null;

  return (
    <div className={`boot ${out ? "out" : ""}`} aria-hidden="true">
      <div className="boot-inner">
        <div className="boot-log">
          {LINES.map((l, i) => (
            <div key={i} className="boot-line" style={{ animationDelay: `${0.15 + i * 0.28}s` }}>
              <span className="boot-prompt">▸</span> {l}
            </div>
          ))}
        </div>
        <div className="boot-mark">
          WORLD CUP<br />MARKETS
        </div>
        <div className="boot-foot">
          <span className="boot-bar"><i /></span>
          <span className="boot-tag">SETTLED BY PROOF</span>
        </div>
      </div>
    </div>
  );
}
