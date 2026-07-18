"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * The hero headline, revealed line-by-line rising out of a clip mask (GSAP).
 * Each line lives in an overflow-hidden wrapper so the inner text sweeps up
 * from below — the "movie title" reveal. Timing is synced to the kickoff
 * Preloader so the words land just as the intro wipes away.
 */
export function KineticHeadline() {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lines = el.querySelectorAll<HTMLElement>(".kh-i");

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      gsap.set(lines, { yPercent: 0 });
      return;
    }

    // Play as the Preloader lifts on first load; near-instant on later navigations.
    // Lines start hidden below their clip mask via CSS, so there's no flash.
    const seen = typeof window !== "undefined" && sessionStorage.getItem("seen-intro");
    const delay = seen ? 0.15 : 1.2;

    // fromTo (not to): the CSS hidden state is translateY(118%), which the
    // browser resolves to pixels — GSAP would read that as yPercent:0 and never
    // move it. Owning the percent-based start explicitly keeps it flash-free.
    const ctx = gsap.context(() => {
      gsap.fromTo(
        lines,
        { yPercent: 118 },
        { yPercent: 0, duration: 1.0, ease: "power4.out", stagger: 0.12, delay }
      );
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <h2 ref={ref} className="kh">
      <span className="kh-line"><span className="kh-i">Bet the World Cup.</span></span>
      <span className="kh-line"><span className="kh-i grad">Settled by proof.</span></span>
    </h2>
  );
}
