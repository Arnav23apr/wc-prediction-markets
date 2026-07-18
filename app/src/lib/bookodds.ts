/**
 * Bookmaker (StablePrice) odds for the web UI — same model as the Striker
 * bot's edge scanner. Real TxLINE feed activates when the API token exists;
 * until the TxODDS activation endpoint unblocks, a deterministic simulated
 * bookie (consensus + slow drift + 5% overround) stands in, and every surface
 * labels which source it is showing.
 */

export interface BookOdds {
  source: "txline" | "sim";
  bookmaker: string;
  decimal: [number, number, number]; // 1X2 decimal odds (with overround)
  fair: [number, number, number];    // overround-removed win probabilities 0..1
  ts: number;
}

/** Same deterministic consensus the market seeder + bot use (keyed by matchId). */
function simConsensus(matchId: number): number[] {
  let s = (matchId * 2654435761) % 2147483647;
  const r = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const a = 25 + r() * 40, b = 15 + r() * 20;
  const c = Math.max(8, 100 - a - b);
  const t = a + b + c;
  return [a / t, b / t, c / t];
}

export function bookOdds(matchId: number): BookOdds {
  const base = simConsensus(matchId);
  const t = Date.now() / 3.6e6; // hours
  const drift = [
    Math.sin(t * 0.9 + matchId) * 0.02,
    Math.sin(t * 1.3 + matchId * 2) * 0.012,
    Math.sin(t * 1.1 + matchId * 3) * 0.02,
  ];
  let probs = base.map((p, i) => Math.max(0.04, p + drift[i]));
  const sum = probs.reduce((s, v) => s + v, 0);
  probs = probs.map((p) => p / sum);
  const OVERROUND = 1.05;
  return {
    source: "sim",
    bookmaker: "StablePrice",
    decimal: probs.map((p) => 1 / (p * OVERROUND)) as [number, number, number],
    fair: probs as [number, number, number],
    ts: Date.now(),
  };
}

export const bookSourceLabel = (b: BookOdds) =>
  b.source === "txline" ? `TxLINE · ${b.bookmaker}` : "StablePrice · simulated (activation pending)";
