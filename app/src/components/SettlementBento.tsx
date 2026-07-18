"use client";

import React from "react";
import { MerkleProof } from "@/components/MerkleProof";

/**
 * The differentiator, shown not told: a bento of mini terminal cards walking
 * through the separation-of-powers settlement (propose → dispute → finalize),
 * anchored by the trustless proof-verification.
 */

const CARDS = [
  {
    cmd: "commit_result",
    title: "Propose",
    body: "The oracle (or anyone holding a proof) proposes the full-time result. Proposing never moves funds, it only starts the clock.",
    role: "ORACLE",
  },
  {
    cmd: "dispute_result",
    title: "Dispute window",
    body: "A watcher can freeze a bad proposal while the countdown runs. Until it elapses, the outcome isn't final.",
    role: "WATCHER",
  },
  {
    cmd: "finalize_result",
    title: "Finalize",
    body: "Permissionless. After the window, anyone closes the market out. Funds are never hostage to the oracle staying online.",
    role: "ANYONE",
  },
];

export function SettlementBento() {
  return (
    <section className="bento">
      <div className="section-head">
        <span className="kicker">Settlement</span>
        <span className="section-count">separation of powers</span>
      </div>

      <div className="bento-grid">
        {CARDS.map((c) => (
          <article key={c.cmd} className="bento-card">
            <div className="bento-win">
              <span className="bento-dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="bento-cmd">{c.cmd}()</span>
            </div>
            <div className="bento-inner">
              <div className="bento-role">{c.role}</div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          </article>
        ))}

        <article className="bento-card bento-hero">
          <div className="bento-win">
            <span className="bento-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="bento-cmd">validate_stat · CPI</span>
          </div>
          <div className="bento-inner bento-proof-row">
            <div>
              <div className="bento-role verified">PROOF-VERIFIED</div>
              <h3>Settled by proof, not by trust</h3>
              <p>
                Anyone can settle a market by submitting TxLINE&apos;s Merkle proof of the final score. The program folds
                it to the published root, or CPIs into TxODDS&apos;s own <code>validate_stat</code>. No oracle key can
                unilaterally pay out. Voids and no-win outcomes refund every stake.
              </p>
            </div>
            <MerkleProof />
          </div>
        </article>
      </div>
    </section>
  );
}
