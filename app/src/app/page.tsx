"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// Wallet button depends on browser-only state (detected wallets, localStorage),
// so render it client-only to avoid an SSR/CSR hydration mismatch.
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);
import { getProgram, getReadonlyProgram } from "@/lib/program";
import { fetchMarkets, fetchUsdcBalance, MarketData } from "@/lib/markets";
import { TrustBar } from "@/components/TrustBar";
import { ActivityTicker } from "@/components/ActivityTicker";
import { HowItWorks } from "@/components/HowItWorks";
import { SoundToggle } from "@/components/SoundToggle";
import { GsapMotion } from "@/components/GsapMotion";
import { FeaturedBanner } from "@/components/FeaturedBanner";
import { MarketTile } from "@/components/MarketTile";
import { CommandPalette } from "@/components/CommandPalette";
import { MarketDetail } from "@/components/MarketDetail";
import { SettlementCinema } from "@/components/SettlementCinema";
import { SettlementBento } from "@/components/SettlementBento";
import { Reveal } from "@/components/Reveal";
import { SegGroup } from "@/components/SegGroup";
import { toUi } from "@/lib/markets";
import { useCountUp } from "@/lib/useCountUp";
import { PROGRAM_ID, RPC_URL } from "@/lib/program";
import { explorerUrl } from "@/lib/share";

type SortKey = "closing" | "pool" | "bettors";
type FilterKey = "all" | "open" | "settled";

const USDC_MINT = process.env.NEXT_PUBLIC_USDC_MINT
  ? new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT)
  : null;

export default function Home() {
  const wallet = useAnchorWallet();
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [hiwOpen, setHiwOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("closing");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [selected, setSelected] = useState<MarketData | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<number | undefined>(undefined);
  const [cinema, setCinema] = useState<MarketData | null>(null);

  const program: Program<Idl> = wallet ? getProgram(wallet) : getReadonlyProgram();

  const load = useCallback(async () => {
    setError(null);
    try {
      setMarkets(await fetchMarkets(getReadonlyProgram()));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000); // live-ish refresh
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!wallet || !USDC_MINT) {
      setBalance(null);
      return;
    }
    let active = true;
    const tick = () =>
      fetchUsdcBalance(wallet.publicKey, USDC_MINT).then((b) => active && setBalance(b));
    tick();
    const id = setInterval(tick, 8_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [wallet, markets]);

  const verifiedCount = useMemo(() => markets.filter((m) => m.resultVerified).length, [markets]);
  const totalPooled = useMemo(() => markets.reduce((s, m) => s + toUi(m.totalPool), 0), [markets]);

  const pooledAnim = Math.round(useCountUp(totalPooled, 900));
  // Keep the open detail view in sync with live market refreshes.
  const selectedLive = useMemo(
    () => (selected ? markets.find((m) => m.pubkey.equals(selected.pubkey)) ?? selected : null),
    [selected, markets]
  );

  const scrollToGrid = () =>
    document.getElementById("markets-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const shown = useMemo(() => {
    let arr = [...markets];
    if (filter === "open") arr = arr.filter((m) => m.status === "open");
    else if (filter === "settled") arr = arr.filter((m) => m.status === "settled" || m.status === "voided");
    if (sort === "closing") arr.sort((a, b) => a.bettingCloseTs - b.bettingCloseTs);
    else if (sort === "pool") arr.sort((a, b) => b.totalPool - a.totalPool);
    else if (sort === "bettors") arr.sort((a, b) => b.numBettors - a.numBettors);
    return arr;
  }, [markets, filter, sort]);

  const FILTERS: { k: FilterKey; label: string }[] = [
    { k: "all", label: "All" },
    { k: "open", label: "Open" },
    { k: "settled", label: "Settled" },
  ];
  const SORTS: { k: SortKey; label: string }[] = [
    { k: "closing", label: "Closing soon" },
    { k: "pool", label: "Biggest pool" },
    { k: "bettors", label: "Most bettors" },
  ];

  return (
    <>
      <GsapMotion />
      <main>
      <header className="topbar glassnav">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </span>
          <h1>Markets</h1>
        </div>
        <button className="searchpill" onClick={() => setCmdOpen(true)} aria-label="Search markets and commands">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <span>Search markets</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="wallet-zone">
          {wallet && balance !== null && (
            <span className="balance-chip">
              {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span>USDC</span>
            </span>
          )}
          <SoundToggle />
          <WalletMultiButton />
        </div>
      </header>

      <FeaturedBanner markets={markets} onOpen={(m) => { setSelectedOutcome(undefined); setSelected(m); }} onJump={scrollToGrid} />

      <TrustBar
        markets={markets.length}
        pooled={pooledAnim}
        verifiedCount={verifiedCount}
        onHowItWorks={() => setHiwOpen(true)}
      />
      <ActivityTicker markets={markets} />

      <div className="section-head">
        <span className="kicker">Live markets</span>
        {markets.length > 0 && (
          <span className="section-count">{shown.length} shown · {markets.length} total</span>
        )}
      </div>

      {markets.length > 0 && (
        <div className="toolbar">
          <SegGroup
            ariaLabel="Filter markets"
            items={FILTERS}
            value={filter}
            onChange={setFilter}
          />
          <SegGroup
            label="Sort"
            ariaLabel="Sort markets"
            items={SORTS}
            value={sort}
            onChange={setSort}
          />
        </div>
      )}

      <Reveal>
        <section className="grid" id="markets-grid">
          {loading && markets.length === 0 &&
            [0, 1, 2].map((i) => <div key={i} className="card skeleton" aria-hidden="true" />)}
          {error && <p className="hint err">RPC error: {error}</p>}
          {!loading && !error && markets.length === 0 && (
            <p className="hint">
              No markets yet. Create some with <code>relayer/create-market</code>.
            </p>
          )}
          {!loading && !error && markets.length > 0 && shown.length === 0 && (
            <p className="hint">No markets match this filter.</p>
          )}
          {shown.map((m, i) => (
            <MarketTile
              key={m.pubkey.toBase58()}
              market={m}
              index={i}
              onOpen={(m, o) => { setSelectedOutcome(o); setSelected(m); }}
              onCinema={setCinema}
            />
          ))}
        </section>
      </Reveal>

      <SettlementBento />

      {cinema && <SettlementCinema market={cinema} onClose={() => setCinema(null)} />}

      {selectedLive && (
        <MarketDetail
          market={selectedLive}
          program={program}
          owner={wallet?.publicKey ?? null}
          initialOutcome={selectedOutcome}
          onChanged={load}
          onClose={() => setSelected(null)}
        />
      )}

      <HowItWorks open={hiwOpen} onClose={() => setHiwOpen(false)} />
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        markets={markets}
        onFilter={setFilter}
        onHowItWorks={() => setHiwOpen(true)}
        onJump={scrollToGrid}
        onExplorer={() => window.open(explorerUrl(PROGRAM_ID.toBase58(), "address", RPC_URL), "_blank")}
        onOpenMarket={(m) => { setSelectedOutcome(undefined); setSelected(m); }}
      />
      <footer className="foot">
        <div className="trust-row">
          {["No trusted oracle", "Anyone can settle", "Voids refund all", "On-chain payouts"].map((b) => (
            <span key={b} className="trust-badge">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              {b}
            </span>
          ))}
          <button className="trust-link" onClick={() => setHiwOpen(true)}>How settlement works</button>
          <a className="trust-link" href={explorerUrl(PROGRAM_ID.toBase58(), "address", RPC_URL)} target="_blank" rel="noreferrer">Program on Explorer ↗</a>
        </div>
        <strong>Trustless settlement.</strong> Anyone can settle a market by submitting TxLINE&apos;s
        Merkle proof of the final score (<code>commit_result_verified</code>). The program verifies it
        folds to the published root, no oracle key required. A trusted{" "}
        <code>commit_result</code> + dispute window remains as fallback. Voids &amp; no-win outcomes
        refund every stake.
      </footer>
    </main>
    </>
  );
}
