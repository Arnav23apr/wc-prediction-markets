"use client";

import React, { useEffect, useState } from "react";
import { getReadonlyProgram } from "@/lib/program";
import { fetchRootRegistry, RegistryView, shortHash } from "@/lib/markets";
import { useCountUp } from "@/lib/useCountUp";

/**
 * Surfaces the project's differentiator: settlements are verified against
 * TxLINE's on-chain Merkle root. Reads the live RootRegistry account.
 */
export function TrustBar({ verifiedCount, onHowItWorks }: { verifiedCount: number; onHowItWorks?: () => void }) {
  const [reg, setReg] = useState<RegistryView | null>(null);
  const animatedVerified = useCountUp(verifiedCount);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetchRootRegistry(getReadonlyProgram()).then((r) => active && setReg(r));
    load();
    const id = setInterval(load, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="trustbar">
      <div className="trustbar-main">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span>
          Settlements <b>cryptographically verified</b> against TxLINE&apos;s on-chain Merkle root
        </span>
      </div>
      <div className="trustbar-meta">
        {reg?.isSet ? (
          <span className="root-chip" title={`TxLINE batch root: ${reg.root}`}>
            <span className="live-dot" /> root <code>{shortHash(reg.root)}</code>
          </span>
        ) : (
          <span className="root-chip dim">root publishes at first settlement</span>
        )}
        {verifiedCount > 0 ? (
          <span className="verified-count">{Math.round(animatedVerified)} verified</span>
        ) : (
          <span className="verified-count dim">proofs land at full time</span>
        )}
        {onHowItWorks && (
          <button className="trustbar-how" onClick={onHowItWorks}>
            How it works
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
