"use client";

import React, { useLayoutEffect, useRef, useState } from "react";

/**
 * Segmented control with a gliding active indicator that slides between
 * options (measured from layout, so it tracks any label widths). The active
 * pill renders text-only; the moving `.tb-ind` is the visible highlight.
 */
export function SegGroup<T extends string>({
  label,
  items,
  value,
  onChange,
  ariaLabel,
}: {
  label?: string;
  items: { k: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
  ariaLabel?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const g = wrap.current;
      if (!g) return;
      const active = g.querySelector<HTMLElement>(`.tb[data-k="${value}"]`);
      if (!active) return;
      const gb = g.getBoundingClientRect();
      const b = active.getBoundingClientRect();
      setBox({ x: b.left - gb.left, y: b.top - gb.top, w: b.width, h: b.height });
    };
    measure();
    // re-measure once fonts settle and on resize
    const t = setTimeout(measure, 60);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [value, items.length]);

  return (
    <div className="tb-group has-ind" ref={wrap} role="group" aria-label={ariaLabel || label || "options"}>
      {label && <span className="tb-label">{label}</span>}
      <span
        className="tb-ind"
        aria-hidden="true"
        style={{
          transform: `translate(${box.x}px, ${box.y}px)`,
          width: box.w,
          height: box.h,
          opacity: box.w ? 1 : 0,
        }}
      />
      {items.map((it) => (
        <button
          key={it.k}
          data-k={it.k}
          className={`tb ${value === it.k ? "on" : ""}`}
          onClick={() => onChange(it.k)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
