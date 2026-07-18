"use client";

import React from "react";

/**
 * The product's own diagram: a Merkle proof, drawn. One leaf (the final
 * score) hashes pairwise up to the published root; the proof path lights up
 * leaf → node → root on a slow loop, then the root verifies. This is the
 * settlement story as a picture instead of a paragraph.
 */
export function MerkleProof() {
  return (
    <div className="mp" aria-hidden="true">
      <svg viewBox="0 0 320 210" width="100%" height="100%">
        {/* edges (static lattice) */}
        <line className="mp-edge" x1="80" y1="118" x2="40" y2="168" />
        <line className="mp-edge" x1="240" y1="118" x2="200" y2="168" />
        <line className="mp-edge" x1="240" y1="118" x2="280" y2="168" />
        <line className="mp-edge" x1="160" y1="52" x2="240" y2="112" />

        {/* proof path (animated) */}
        <line className="mp-path mp-p1" x1="120" y1="168" x2="80" y2="118" />
        <line className="mp-path mp-p2" x1="80" y1="112" x2="160" y2="52" />

        {/* leaves */}
        <g className="mp-leaf mp-hot">
          <rect x="88" y="168" width="64" height="26" rx="6" />
          <text x="120" y="185">ESP 2–1</text>
        </g>
        <g className="mp-leaf">
          <rect x="12" y="168" width="56" height="26" rx="6" />
          <text x="40" y="185">9f3a…</text>
        </g>
        <g className="mp-leaf">
          <rect x="172" y="168" width="56" height="26" rx="6" />
          <text x="200" y="185">c41d…</text>
        </g>
        <g className="mp-leaf">
          <rect x="252" y="168" width="56" height="26" rx="6" />
          <text x="280" y="185">77b2…</text>
        </g>

        {/* mid nodes */}
        <g className="mp-node mp-hot2">
          <circle cx="80" cy="112" r="9" />
        </g>
        <g className="mp-node">
          <circle cx="240" cy="112" r="9" />
        </g>

        {/* root */}
        <g className="mp-root">
          <rect x="118" y="26" width="84" height="30" rx="8" />
          <text className="mp-root-label" x="150" y="45">root</text>
          <path className="mp-check" d="M172 41 l5 5 l9 -10" />
        </g>
      </svg>

      <style jsx>{`
        .mp { width: 300px; max-width: 100%; flex-shrink: 0; }
        .mp-edge { stroke: rgba(255, 255, 255, 0.10); stroke-width: 1.25; }

        .mp-path {
          stroke: #34d399; stroke-width: 1.75; stroke-linecap: round;
          stroke-dasharray: 110; stroke-dashoffset: 110;
        }
        .mp-p1 { animation: mp-draw 6s ease-in-out infinite; }
        .mp-p2 { animation: mp-draw 6s ease-in-out infinite; animation-delay: 0.9s; }

        .mp-leaf rect, .mp-node circle {
          fill: #0f1017; stroke: rgba(255, 255, 255, 0.16); stroke-width: 1.1;
        }
        .mp-leaf text {
          fill: rgba(255, 255, 255, 0.42); font-family: var(--sf, ui-monospace), ui-monospace, monospace;
          font-size: 10.5px; text-anchor: middle;
        }
        .mp-hot rect { stroke: rgba(52, 211, 153, 0.65); }
        .mp-hot text { fill: rgba(52, 211, 153, 0.9); }
        .mp-hot2 circle { animation: mp-node-light 6s ease-in-out infinite; }

        .mp-root rect { fill: #0f1017; stroke: rgba(255, 255, 255, 0.16); stroke-width: 1.1; animation: mp-root-light 6s ease-in-out infinite; }
        .mp-root-label {
          fill: rgba(255, 255, 255, 0.6); font-family: var(--sf, ui-monospace), ui-monospace, monospace;
          font-size: 11px; text-anchor: middle;
        }
        .mp-check {
          fill: none; stroke: #34d399; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
          animation: mp-check-pop 6s ease-in-out infinite;
        }

        @keyframes mp-draw {
          0%, 8% { stroke-dashoffset: 110; }
          26%, 78% { stroke-dashoffset: 0; }
          92%, 100% { stroke-dashoffset: 110; }
        }
        @keyframes mp-node-light {
          0%, 20% { stroke: rgba(255, 255, 255, 0.16); }
          30%, 78% { stroke: rgba(52, 211, 153, 0.7); }
          92%, 100% { stroke: rgba(255, 255, 255, 0.16); }
        }
        @keyframes mp-root-light {
          0%, 38% { stroke: rgba(255, 255, 255, 0.16); }
          48%, 78% { stroke: rgba(52, 211, 153, 0.75); }
          92%, 100% { stroke: rgba(255, 255, 255, 0.16); }
        }
        @keyframes mp-check-pop {
          0%, 42% { opacity: 0; }
          50%, 80% { opacity: 1; }
          90%, 100% { opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .mp-p1, .mp-p2 { animation: none; stroke-dashoffset: 0; }
          .mp-hot2 circle { animation: none; stroke: rgba(52, 211, 153, 0.7); }
          .mp-root rect { animation: none; stroke: rgba(52, 211, 153, 0.75); }
          .mp-check { animation: none; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
