"use client";

import React, { useEffect, useState } from "react";
import { getReadonlyProgram } from "@/lib/program";
import { fetchRootRegistry, shortHash, MarketData } from "@/lib/markets";

/**
 * Visualises the on-chain verification for a proof-settled market: the proven
 * full-time score folded through TxLINE's three-stage Merkle hierarchy to the
 * published batch root. Score + root are read live from chain; the fold stages
 * mirror programs/.../merkle.rs (stat → event → sub-tree → batch).
 */
export function ProofDrawer({ market }: { market: MarketData }) {
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<string | null>(null);

  useEffect(() => {
    if (!open || root) return;
    fetchRootRegistry(getReadonlyProgram()).then((r) => r && setRoot(r.root));
  }, [open, root]);

  if (!market.resultVerified) return null;

  const stages = [
    { label: "Goal stats proven", detail: `${market.homeTeam} ${market.homeGoals} – ${market.awayGoals} ${market.awayTeam}` },
    { label: "Stat → event-stat root", detail: "leaf hashes fold to one event root" },
    { label: "Event → sub-tree root", detail: "sub-tree proof" },
    { label: "Sub-tree → batch root", detail: "main-tree proof" },
  ];

  return (
    <div className={`proof ${open ? "open" : ""}`}>
      <button className="proof-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="proof-toggle-l">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" />
          </svg>
          How this was verified
        </span>
        <svg className="chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="proof-body">
          <div className="proof-steps">
            {stages.map((s, i) => (
              <div key={i} className="proof-step">
                <span className="proof-dot" />
                <div>
                  <div className="proof-step-label">{s.label}</div>
                  <div className="proof-step-detail">{s.detail}</div>
                </div>
              </div>
            ))}
            <div className="proof-step match">
              <span className="proof-check">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <div>
                <div className="proof-step-label">Matches published TxLINE root</div>
                <div className="proof-step-detail mono">{root ? shortHash(root) : "…"}</div>
              </div>
            </div>
          </div>
          <p className="proof-foot">
            Verified on-chain by <code>commit_result_verified</code>. Permissionless, no oracle key trusted.
          </p>
        </div>
      )}
    </div>
  );
}
