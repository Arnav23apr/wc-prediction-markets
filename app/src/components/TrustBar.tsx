"use client";

import React, { useEffect, useState } from "react";
import { getReadonlyProgram } from "@/lib/program";
import { fetchRootRegistry, RegistryView, shortHash } from "@/lib/markets";
import { useCountUp } from "@/lib/useCountUp";

/**
 * The single strip under the hero: live tournament metrics on the left,
 * the settlement trust signal (verified against TxLINE's on-chain Merkle root,
 * live root hash once published) on the right. One clean line, no redundancy.
 */
export function TrustBar({
  markets,
  pooled,
  verifiedCount,
  onHowItWorks,
}: {
  markets: number;
  pooled: number;
  verifiedCount: number;
  onHowItWorks?: () => void;
}) {
  const [reg, setReg] = useState<RegistryView | null>(null);
  const animatedVerified = useCountUp(verifiedCount);

  useEffect(() => {
    let active = true;
    const load = () => fetchRootRegistry(getReadonlyProgram()).then((r) => active && setReg(r));
    load();
    const id = setInterval(load, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="mstrip">
      <div className="mstrip-stats">
        <span className="mstrip-stat"><b>{markets}</b> markets</span>
        <i className="mstrip-sep" aria-hidden="true" />
        <span className="mstrip-stat"><b>${Math.round(pooled).toLocaleString()}</b> pooled</span>
        <i className="mstrip-sep" aria-hidden="true" />
        {verifiedCount > 0 ? (
          <span className="mstrip-stat"><b>{Math.round(animatedVerified)}</b> proof-verified</span>
        ) : (
          <span className="mstrip-stat dim">proofs land at full time</span>
        )}
      </div>

      <div className="mstrip-trust">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span>verified against TxLINE&apos;s on-chain Merkle root</span>
        {reg?.isSet && (
          <span className="root-chip" title={`TxLINE batch root: ${reg.root}`}>
            <span className="live-dot" /> root <code>{shortHash(reg.root)}</code>
          </span>
        )}
        {onHowItWorks && (
          <button className="mstrip-how" onClick={onHowItWorks}>
            How it works
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
