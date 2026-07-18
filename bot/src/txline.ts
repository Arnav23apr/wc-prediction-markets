/**
 * TxLINE StablePrice odds for Striker's edge scanner.
 *
 * Real path: guest JWT + activated API token (env TXLINE_API_TOKEN) →
 * /api/fixtures/snapshot to map our market to a FixtureId → /api/odds/snapshot.
 * The devnet activation endpoint currently 504s on TxODDS's side, so until a
 * token exists every call falls through to a deterministic simulated bookmaker
 * anchored to the same consensus the seeder used. The source is always
 * labelled so the UI never passes sim data off as the live feed.
 */

import { Market, simConsensus } from "./chain";

const BASE = process.env.TXLINE_BASE ?? "https://txline.txodds.com";
const API_TOKEN = process.env.TXLINE_API_TOKEN ?? "";

export interface BookOdds {
  source: "txline" | "sim";
  bookmaker: string;
  decimal: [number, number, number]; // 1X2 decimal odds (with overround)
  fair: [number, number, number];    // overround-removed win probabilities, 0..1
  ts: number;
}

export interface Edge {
  outcome: number;      // 0 home, 1 draw, 2 away
  poolMult: number;     // what the pool pays today (net of fee)
  fairMult: number;     // bookmaker fair-value multiplier (1 / fair prob)
  edgePct: number;      // (poolMult / fairMult - 1) * 100
}

// ---------- real feed ----------

let guestJwt: { token: string; exp: number } | null = null;

async function getGuestJwt(): Promise<string> {
  if (guestJwt && Date.now() < guestJwt.exp) return guestJwt.token;
  const res = await fetch(`${BASE}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`guest/start ${res.status}`);
  const { token } = (await res.json()) as { token: string };
  guestJwt = { token, exp: Date.now() + 20 * 24 * 3600 * 1000 };
  return token;
}

async function txGet(path: string): Promise<any> {
  const jwt = await getGuestJwt();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": API_TOKEN },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

async function findFixtureId(m: Market): Promise<number | null> {
  const day = Math.floor(Date.now() / 86400000);
  const fixtures = (await txGet(`/api/fixtures/snapshot?startEpochDay=${day}`)) as any[];
  const h = norm(m.home), a = norm(m.away);
  const hit = fixtures.find((f) => {
    const p1 = norm(f.Participant1 ?? ""), p2 = norm(f.Participant2 ?? "");
    return (p1.includes(h) && p2.includes(a)) || (p1.includes(a) && p2.includes(h));
  });
  return hit ? Number(hit.FixtureId) : null;
}

/** Parse a raw StablePrice integer into decimal odds (feed encodes fixed-point). */
function toDecimal(p: number): number {
  if (p > 1000) return p / 1000;
  if (p > 100) return p / 100;
  return p;
}

async function fetchTxlineOdds(m: Market): Promise<BookOdds | null> {
  const fixtureId = await findFixtureId(m);
  if (!fixtureId) return null;
  const snap = (await txGet(`/api/odds/snapshot/${fixtureId}`)) as any[];
  // latest 3-way (1X2 / money-line) entry with three prices
  const rows = snap
    .filter((o) => Array.isArray(o.Prices) && o.Prices.length === 3)
    .sort((x, y) => Number(y.Ts ?? 0) - Number(x.Ts ?? 0));
  const row = rows[0];
  if (!row) return null;
  const dec = row.Prices.map(toDecimal) as [number, number, number];
  if (dec.some((d) => !(d > 1))) return null;
  const raw = dec.map((d) => 1 / d);
  const over = raw.reduce((s, v) => s + v, 0);
  return {
    source: "txline",
    bookmaker: String(row.Bookmaker ?? "StablePrice"),
    decimal: dec,
    fair: raw.map((v) => v / over) as [number, number, number],
    ts: Number(row.Ts ?? Date.now()),
  };
}

// ---------- simulated bookmaker (deterministic + slow drift) ----------

function simOdds(m: Market): BookOdds {
  const base = simConsensus(m.matchId).map((p) => p / 100); // [h,d,a] 0..1
  // slow drift so the "market" breathes between refreshes
  const t = Date.now() / 3.6e6; // hours
  const drift = [
    Math.sin(t * 0.9 + m.matchId) * 0.02,
    Math.sin(t * 1.3 + m.matchId * 2) * 0.012,
    Math.sin(t * 1.1 + m.matchId * 3) * 0.02,
  ];
  let probs = base.map((p, i) => Math.max(0.04, p + drift[i]));
  const sum = probs.reduce((s, v) => s + v, 0);
  probs = probs.map((p) => p / sum);
  const OVERROUND = 1.05; // classic ~5% bookie margin
  const decimal = probs.map((p) => 1 / (p * OVERROUND)) as [number, number, number];
  return {
    source: "sim",
    bookmaker: "StablePrice (simulated)",
    decimal,
    fair: probs as [number, number, number],
    ts: Date.now(),
  };
}

// ---------- public API ----------

const cache = new Map<number, { at: number; odds: BookOdds }>();
const TTL = 60_000;

export async function bookOdds(m: Market): Promise<BookOdds> {
  const hit = cache.get(m.matchId);
  if (hit && Date.now() - hit.at < TTL) return hit.odds;
  let odds: BookOdds | null = null;
  if (API_TOKEN) {
    try { odds = await fetchTxlineOdds(m); } catch { odds = null; }
  }
  if (!odds) odds = simOdds(m);
  cache.set(m.matchId, { at: Date.now(), odds });
  return odds;
}

/** Pool payout vs bookmaker fair value, per outcome. Only priced outcomes. */
export function edgesFor(m: Market, book: BookOdds, poolMult: (o: number) => number): Edge[] {
  const out: Edge[] = [];
  for (let o = 0; o < 3; o++) {
    const pm = poolMult(o);
    if (!pm || pm <= 0) continue;
    const fairMult = 1 / book.fair[o];
    out.push({ outcome: o, poolMult: pm, fairMult, edgePct: (pm / fairMult - 1) * 100 });
  }
  return out.sort((a, b) => b.edgePct - a.edgePct);
}

export const sourceLabel = (b: BookOdds) =>
  b.source === "txline" ? `TxLINE · ${b.bookmaker}` : "simulated bookie (TxLINE activation pending)";
