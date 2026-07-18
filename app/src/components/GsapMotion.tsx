"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Scroll-driven polish for the landing page (GSAP + ScrollTrigger, synced to
 * Lenis in SmoothScroll):
 *   - the hero sub-copy rises in just after the kinetic headline,
 *   - the stadium video and globe drift at different rates for depth (parallax),
 *   - the trust bar fades up as it enters the viewport.
 * Everything is a no-op under prefers-reduced-motion.
 */
export function GsapMotion() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // Hero reveal is pure CSS (see .hero2 keyframes) — deterministic.
      // GSAP handles only scroll-linked motion, where it is proven reliable.

      // Trust bar reveals on entry.
      if (document.querySelector(".trustbar")) {
        gsap.from(".trustbar", {
          y: 24,
          autoAlpha: 0,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: { trigger: ".trustbar", start: "top 90%" },
        });
      }
    });

    // Layout settles after the video/markets load — recompute trigger positions.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    const t = setTimeout(refresh, 1200);

    return () => {
      window.removeEventListener("load", refresh);
      clearTimeout(t);
      ctx.revert();
    };
  }, []);

  return null;
}
