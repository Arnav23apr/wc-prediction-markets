"use client";

import React, { useEffect } from "react";
import { PROGRAM_ID, RPC_URL } from "@/lib/program";
import { explorerUrl } from "@/lib/share";

const STEPS = [
  { t: "Back an outcome", d: "Stake USDC on Home, Draw or Away. It's parimutuel: all stakes pool together and the odds move with the crowd." },
  { t: "TxLINE publishes the result", d: "After full time, TxLINE posts the final score and a Merkle root of the whole batch on-chain." },
  { t: "Anyone settles with a proof", d: "commit_result_verified submits TxLINE's Merkle proof; the program re-hashes it and checks it folds to the published root. No oracle key, no admin." },
  { t: "Winners split the pool", d: "Claim your share trustlessly. A voided match refunds every stake. Losing outcomes simply don't claim." },
];

const BADGES = ["No trusted oracle", "Anyone can settle", "Voids refund all", "On-chain payouts"];

const Check = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);

export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const pid = PROGRAM_ID.toBase58();

  return (
    <div className="wm-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="How settlement works" data-lenis-prevent>
      <div className="wm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wm-head">
          <div>
            <h3>How settlement works</h3>
            <p className="muted">Trustless parimutuel markets. No oracle to trust.</p>
          </div>
          <button className="wm-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="hiw-body">
          <ol className="hiw-steps">
            {STEPS.map((s, i) => (
              <li key={i}>
                <span className="hiw-num">{i + 1}</span>
                <div><b>{s.t}</b><p>{s.d}</p></div>
              </li>
            ))}
          </ol>
          <div className="hiw-badges">
            {BADGES.map((b) => (
              <span key={b} className="hiw-badge"><Check /> {b}</span>
            ))}
          </div>
          <a className="hiw-link" href={explorerUrl(pid, "address", RPC_URL)} target="_blank" rel="noreferrer">
            Program <code>{pid.slice(0, 4)}…{pid.slice(-4)}</code> on Solana Explorer
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg>
          </a>
        </div>
      </div>
    </div>
  );
}
