"use client";

import React from "react";

/**
 * A faint top-down football pitch drawn behind the app. On-theme ambiance,
 * pure SVG, fixed and non-interactive. Tint/opacity come from the `.pitch` CSS.
 */
export function PitchLines() {
  return (
    <div className="pitch" aria-hidden="true">
      <svg viewBox="0 0 1000 640" fill="none" stroke="currentColor" strokeWidth={2}>
        {/* touchlines */}
        <rect x={20} y={20} width={960} height={600} rx={6} />
        {/* halfway line + centre circle */}
        <line x1={500} y1={20} x2={500} y2={620} />
        <circle cx={500} cy={320} r={72} />
        <circle cx={500} cy={320} r={3.5} fill="currentColor" stroke="none" />
        {/* left penalty + goal area */}
        <rect x={20} y={150} width={150} height={340} />
        <rect x={20} y={245} width={55} height={150} />
        <circle cx={115} cy={320} r={3.5} fill="currentColor" stroke="none" />
        <path d="M170 273 A72 72 0 0 1 170 367" />
        {/* right penalty + goal area */}
        <rect x={830} y={150} width={150} height={340} />
        <rect x={925} y={245} width={55} height={150} />
        <circle cx={885} cy={320} r={3.5} fill="currentColor" stroke="none" />
        <path d="M830 273 A72 72 0 0 0 830 367" />
        {/* corner arcs */}
        <path d="M20 33 A13 13 0 0 1 33 20" />
        <path d="M967 20 A13 13 0 0 1 980 33" />
        <path d="M33 620 A13 13 0 0 1 20 607" />
        <path d="M980 607 A13 13 0 0 1 967 620" />
      </svg>
    </div>
  );
}
