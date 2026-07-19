import confetti from "canvas-confetti";

/** Celebratory burst for a winning claim. Respects reduced-motion. */
export function celebrate() {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const colors = ["#f0a92a", "#ffc65c", "#ffe1a3", "#34d399"];
  confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors });
  setTimeout(() => confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 }, colors }), 150);
  setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 }, colors }), 150);
}
