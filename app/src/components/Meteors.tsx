"use client";

import React, { useMemo } from "react";

/**
 * A subtle meteor shower drifting across the background (Magic UI style).
 * Pure CSS animation, fixed full-screen, non-interactive.
 */
export function Meteors({ count = 12 }: { count?: number }) {
  const meteors = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        left: Math.random() * 100,
        delay: Math.random() * 8,
        duration: 4 + Math.random() * 5,
      })),
    [count]
  );

  return (
    <div className="meteors" aria-hidden="true">
      {meteors.map((m, i) => (
        <span
          key={i}
          className="meteor"
          style={{
            left: `${m.left}%`,
            animationDelay: `${m.delay}s`,
            animationDuration: `${m.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
