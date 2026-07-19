"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MarketData, statusLabel, toUi } from "@/lib/markets";

type Action = { id: string; label: string; hint?: string; group: string; run: () => void };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  markets: MarketData[];
  onFilter: (f: "all" | "open" | "settled") => void;
  onHowItWorks: () => void;
  onJump: () => void;
  onExplorer: () => void;
  onOpenMarket: (m: MarketData) => void;
  onCinema?: (m: MarketData) => void;
}

/** Fuzzy subsequence match (Linear/terminal-style command matching). */
function fuzzy(hay: string, q: string): boolean {
  if (!q) return true;
  hay = hay.toLowerCase();
  q = q.toLowerCase();
  if (hay.includes(q)) return true;
  let i = 0;
  for (const c of hay) if (c === q[i]) i++;
  return i === q.length;
}

/**
 * ⌘K command palette — search every market and jump to any action.
 * The terminal-native way to move around a data product.
 */
export function CommandPalette({ open, onOpenChange, markets, onFilter, onHowItWorks, onJump, onExplorer, onOpenMarket, onCinema }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = () => onOpenChange(false);
  const fire = (fn: () => void) => { fn(); close(); };

  // Global ⌘K / Ctrl+K to toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const settledDemo = useMemo(
    () => markets.find((m) => (m.status === "settled" || m.status === "voided") && m.finalOutcome < 3) ?? null,
    [markets]
  );

  const actions: Action[] = useMemo(() => [
    ...(onCinema && settledDemo
      ? [{ id: "cinema", label: "Replay a settlement (cinema)", hint: `${settledDemo.homeTeam} v ${settledDemo.awayTeam}`, group: "Demo", run: () => onCinema(settledDemo) }]
      : []),
    { id: "all", label: "Show all markets", group: "Filter", run: () => { onFilter("all"); onJump(); } },
    { id: "open", label: "Open markets only", group: "Filter", run: () => { onFilter("open"); onJump(); } },
    { id: "settled", label: "Settled markets only", group: "Filter", run: () => { onFilter("settled"); onJump(); } },
    { id: "hiw", label: "How settlement works", group: "Learn", run: onHowItWorks },
    { id: "grid", label: "Jump to markets", group: "Navigate", run: onJump },
    { id: "explorer", label: "View program on Solana Explorer", group: "Navigate", run: onExplorer },
  ], [onFilter, onHowItWorks, onJump, onExplorer, onCinema, settledDemo]);

  const marketActions: Action[] = useMemo(() => markets.map((m) => ({
    id: m.pubkey.toBase58(),
    label: `${m.homeTeam} vs ${m.awayTeam}`,
    hint: `${statusLabel(m.status)} · ${toUi(m.totalPool).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC`,
    group: "Markets",
    run: () => onOpenMarket(m),
  })), [markets, onOpenMarket]);

  const results = useMemo(() => {
    const all = [...actions, ...marketActions];
    return all.filter((a) => fuzzy(a.label, query) || fuzzy(a.group, query));
  }, [actions, marketActions, query]);

  useEffect(() => { setActive(0); }, [query]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); results[active] && fire(results[active].run); }
  };

  // Keep the active row scrolled into view.
  const setRow = (el: HTMLButtonElement | null, i: number) => {
    if (el && i === active) el.scrollIntoView({ block: "nearest" });
  };

  let lastGroup = "";

  return (
    <div className="cmdk-backdrop" onClick={close} data-lenis-prevent>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search markets or run a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="cmdk-esc">ESC</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && <div className="cmdk-empty">No matches</div>}
          {results.map((a, i) => {
            const showGroup = a.group !== lastGroup;
            lastGroup = a.group;
            return (
              <React.Fragment key={a.id}>
                {showGroup && <div className="cmdk-group">{a.group}</div>}
                <button
                  ref={(el) => setRow(el, i)}
                  className={`cmdk-row ${i === active ? "on" : ""}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => fire(a.run)}
                >
                  <span className="cmdk-label">{a.label}</span>
                  {a.hint && <span className="cmdk-hint">{a.hint}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>⌘</kbd><kbd>K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
