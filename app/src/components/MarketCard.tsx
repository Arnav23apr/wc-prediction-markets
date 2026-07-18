"use client";

import React, { useEffect, useState } from "react";
import { Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { positionPda } from "@/lib/pdas";
import {
  MarketData,
  OUTCOMES,
  impliedPct,
  payoutMultiplier,
  statusLabel,
  marketPhase,
  phaseLabel,
  outcomeLabel,
  toUi,
} from "@/lib/markets";
import { placeBet, claim } from "@/lib/actions";
import { useCountUp } from "@/lib/useCountUp";
import { flagUrl, teamAbbr, kitColor } from "@/lib/flags";
import { useToast } from "@/components/Toast";
import { celebrate } from "@/lib/confetti";
import { playSuccess, playError } from "@/lib/sound";
import { ProofDrawer } from "@/components/ProofDrawer";

interface Props {
  market: MarketData;
  program: Program<Idl> | null;
  owner: PublicKey | null;
  onChanged: () => void;
  onOpen?: (m: MarketData) => void;
  onCinema?: (m: MarketData) => void;
  initialOutcome?: number;
}

const QUICK = [10, 50, 100, 250];
const Spinner = () => <span className="spinner" aria-label="processing" />;

export function MarketCard({ market, program, owner, onChanged, onOpen, onCinema, initialOutcome }: Props) {
  const [amount, setAmount] = useState("10");
  const [selected, setSelected] = useState(initialOutcome ?? 0);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const pct = impliedPct(market.pools);
  const animatedPool = Math.round(useCountUp(toUi(market.totalPool)));
  const now = Math.floor(Date.now() / 1000);
  const bettingOpen = market.status === "open" && now < market.bettingCloseTs;
  const terminal = market.status === "settled" || market.status === "voided";

  const [position, setPosition] = useState<any>(null);
  useEffect(() => {
    let active = true;
    if (!program || !owner || !terminal) {
      setPosition(null);
      return;
    }
    (async () => {
      try {
        const pos = await (program.account as any).position.fetchNullable(positionPda(market.pubkey, owner));
        if (active) setPosition(pos);
      } catch {
        if (active) setPosition(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [program, owner, terminal, market.pubkey, market.status]);

  const canClaim =
    !!position &&
    !position.claimed &&
    (market.status === "voided"
      ? Number(position.totalStake) > 0
      : Number(position.stakes?.[market.finalOutcome] ?? 0) > 0);

  const send = async (fn: () => Promise<string>, okMsg: string, party = false) => {
    if (!program || !owner) return;
    setBusy(true);
    try {
      const sig = await fn();
      toast({ kind: "success", msg: okMsg, sig });
      if (party) celebrate();
      playSuccess();
      onChanged();
    } catch (e: any) {
      playError();
      toast({ kind: "error", msg: parseErr(e) });
    } finally {
      setBusy(false);
    }
  };

  // Payout preview: what `amount` on `selected` returns if it wins.
  const amt = Number(amount) || 0;
  const newWin = toUi(market.pools[selected]) + amt;
  const newTotal = toUi(market.totalPool) + amt;
  const previewPayout = newWin > 0 ? (amt * newTotal * (1 - market.feeBps / 10000)) / newWin : 0;

  const Side = ({ name, right = false }: { name: string; right?: boolean }) => {
    const flag = flagUrl(name);
    const kit = <span className="sb-kit" style={{ background: kitColor(name) }} aria-hidden="true" />;
    const img = flag && <img className="sb-flag" src={flag} alt="" />;
    return (
      <div className={`sb-side ${right ? "r" : ""}`} title={name}>
        {right ? <><span className="sb-abbr">{teamAbbr(name)}</span>{img}{kit}</> : <>{kit}{img}<span className="sb-abbr">{teamAbbr(name)}</span></>}
      </div>
    );
  };

  return (
    <div className="tilt-card">
    <div className="card">
      <div className="scoreboard wc26-shadow">
        <Side name={market.homeTeam} />
        <div className="sb-center">
          {terminal && market.resultVerified && market.finalOutcome < 3 ? (
            <span className="sb-score tnum">{market.homeGoals}<i>:</i>{market.awayGoals}</span>
          ) : (
            <span className="sb-vs">VS</span>
          )}
          <span className={`sb-status badge-${marketPhase(market)}`}>{phaseLabel(marketPhase(market))}</span>
        </div>
        <Side name={market.awayTeam} right />
      </div>

      <div className="meta">
        <span>Pool: {animatedPool.toLocaleString()} USDC</span>
        <span>{market.numBettors} bettors</span>
        <span>Fee {market.feeBps / 100}%</span>
        {onOpen && (
          <button className="card-expand" onClick={() => onOpen(market)}>
            Chart &amp; details
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
          </button>
        )}
      </div>

      {market.status === "open" && (
        <div className="resolve-note">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          Resolves to the official 90-minute full-time result (incl. stoppage) from the TxODDS feed, verified on-chain. Fee is a flat pool percentage shown above — no hidden vig. Multipliers float with the pool and lock at kickoff. </div>
      )}

      <div className="outcomes">
        {OUTCOMES.map((label, i) => {
          const isWinner = terminal && market.finalOutcome === i;
          const selectable = bettingOpen;
          return (
            <div
              key={i}
              className={`outcome ${isWinner ? "winner" : ""} ${selectable && selected === i ? "picked" : ""} ${selectable ? "clickable" : ""}`}
              onClick={() => selectable && setSelected(i)}
            >
              <div className="outcome-top">
                <span>{label}</span>
                <span className="mult">
                  {market.status === "open"
                    ? (payoutMultiplier(market.pools, i, market.feeBps) > 0
                        ? `${payoutMultiplier(market.pools, i, market.feeBps).toFixed(2)}×`
                        : "–")
                    : `${toUi(market.pools[i]).toLocaleString()}`}
                </span>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${pct[i].toFixed(1)}%` }} />
              </div>
              <div className="pct">{pct[i].toFixed(1)}%</div>
            </div>
          );
        })}
      </div>

      {(market.status === "resultProposed" || market.status === "disputed") && (
        <div className="note">
          Proposed result: <b>{outcomeLabel(market.proposedOutcome)}</b>
          {market.status === "resultProposed" && (
            <> · finalizes after dispute window ({Math.max(0, market.resultCommitTs + market.disputeWindow - now)}s)</>
          )}
        </div>
      )}
      {terminal && (
        <div className="note">
          Final: <b>{outcomeLabel(market.finalOutcome)}</b>
          {market.resultVerified && market.finalOutcome < 3 && (
            <> ({market.homeGoals}–{market.awayGoals})</>
          )}
          {market.status === "voided" && <> · all stakes refundable</>}
          {market.resultVerified && (
            <span className="verified-tag" title="Settled from a verified TxODDS Merkle proof">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              TxODDS-verified
            </span>
          )}
        </div>
      )}

      {terminal && <ProofDrawer market={market} />}

      {terminal && onCinema && market.finalOutcome < 3 && (
        <button className="card-cinema" onClick={() => onCinema(market)}>
          ▸ Replay settlement
        </button>
      )}

      {bettingOpen && (
        <div className="bet-row">
          <div className="seg">
            {OUTCOMES.map((label, i) => (
              <button key={i} className={`seg-btn ${selected === i ? "active" : ""}`} onClick={() => setSelected(i)} disabled={busy}>
                {label}
              </button>
            ))}
          </div>
          <div className="amount-wrap">
            <input
              className="amount"
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="Amount"
              aria-label={`Bet amount in USDC for ${market.homeTeam} vs ${market.awayTeam}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
            <span className="amount-suffix">USDC</span>
          </div>
          <div className="chips">
            {QUICK.map((v) => (
              <button key={v} className="chip" onClick={() => setAmount(String(v))} disabled={busy}>
                {v}
              </button>
            ))}
          </div>
          {amt > 0 && (
            <div className="payout-preview">
              If <b>{OUTCOMES[selected]}</b> wins → <b>{previewPayout.toFixed(1)} USDC</b>
              <span className="mult-chip">{(previewPayout / amt).toFixed(2)}×</span>
            </div>
          )}
          <button
            className="primary"
            disabled={busy || !program || !owner || amt <= 0}
            onClick={() => send(() => placeBet(program!, market, owner!, selected, amt), `Bet placed on ${OUTCOMES[selected]}`)}
          >
            {busy ? <Spinner /> : owner ? "Place bet" : "Connect wallet"}
          </button>
        </div>
      )}

      {terminal && owner && canClaim && (
        <button
          className="primary claim"
          disabled={busy || !program}
          onClick={() =>
            send(
              () => claim(program!, market, owner),
              market.status === "voided" ? "Refund claimed" : "Winnings claimed",
              market.status === "settled"
            )
          }
        >
          {busy ? <Spinner /> : market.status === "voided" ? "Claim refund" : "Claim winnings"}
        </button>
      )}
    </div>
    </div>
  );
}

function parseErr(e: any): string {
  const s = e?.error?.errorMessage ?? e?.message ?? String(e);
  const m = /NothingToClaim|AlreadyClaimed|BettingClosed|MarketNotOpen|NotSettled|MerkleVerificationFailed/.exec(String(e));
  return m ? m[0].replace(/([A-Z])/g, " $1").trim() : s.slice(0, 120);
}
