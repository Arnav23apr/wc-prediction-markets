import { useEffect, useRef, useState } from "react";

/** Smoothly animate a number toward `target` (eased) when it changes. */
export function useCountUp(target: number, ms = 600): number {
  const [val, setVal] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const start = performance.now();
    const f = from.current;
    if (f === target) return;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(f + (target - f) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return val;
}
