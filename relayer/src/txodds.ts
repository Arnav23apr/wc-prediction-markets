import { config, isMockMode } from "./config";

// On-chain outcome codes (mirror programs/.../constants.rs)
export const OUTCOME = { HOME: 0, DRAW: 1, AWAY: 2, VOID: 255 } as const;

export interface Fixture {
  matchId: number; // TxODDS fixture id -> Market seed
  homeTeam: string;
  awayTeam: string;
  kickoffTs: number; // unix seconds
}

export type MatchState = "scheduled" | "live" | "finished" | "abandoned" | "postponed";

export interface MatchResult {
  matchId: number;
  state: MatchState;
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * Map a finished/abandoned match to an on-chain outcome code.
 * Only "finished" maps to a real result; everything irregular voids the market.
 */
export function resultToOutcome(r: MatchResult): number | null {
  if (r.state === "abandoned" || r.state === "postponed") return OUTCOME.VOID;
  if (r.state !== "finished" || r.homeScore === null || r.awayScore === null) return null;
  if (r.homeScore > r.awayScore) return OUTCOME.HOME;
  if (r.homeScore < r.awayScore) return OUTCOME.AWAY;
  return OUTCOME.DRAW;
}

export interface TxOddsClient {
  listFixtures(): Promise<Fixture[]>;
  getResult(matchId: number): Promise<MatchResult>;
  /**
   * Fetch the raw two-stat `stat-validation` Merkle proof for a fixture's
   * home + away goal totals. Feeds the trustless `commit_result_validated`
   * CPI path. Returns null if the API can't provide one (or in mock mode).
   */
  getStatValidation(matchId: number, seq: number, statKeyHome: number, statKeyAway: number): Promise<any | null>;
}

/**
 * Live client for the TxLINE API (https://txline.txodds.com).
 *
 * Auth is a two-token scheme: a 30-day guest JWT (POST /auth/guest/start) plus a
 * long-lived `X-Api-Token` obtained from the on-chain activate-subscription flow.
 * World Cup data is available on free service levels (60s-delay or real-time), so
 * activation does not require buying TxL tokens — just subscribing to the free
 * leagues. See relayer/.env.example.
 */
class LiveTxOddsClient implements TxOddsClient {
  private guestJwt = config.txOddsGuestJwt;
  // fixtureId -> is Participant1 the home side (needed to orient scores)
  private orientation = new Map<number, boolean>();

  private async ensureGuestJwt(): Promise<string> {
    if (this.guestJwt) return this.guestJwt;
    const res = await fetch(`${config.txOddsBaseUrl}/auth/guest/start`, { method: "POST" });
    if (!res.ok) throw new Error(`guest/start -> ${res.status} ${res.statusText}`);
    this.guestJwt = (await res.json()).token;
    return this.guestJwt;
  }

  private async get(path: string): Promise<any> {
    const jwt = await this.ensureGuestJwt();
    const res = await fetch(`${config.txOddsBaseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": config.txOddsApiToken,
        Accept: "application/json",
      },
    });
    if (res.status === 401) {
      // guest JWT likely expired; drop it and retry once
      this.guestJwt = "";
      const jwt2 = await this.ensureGuestJwt();
      const retry = await fetch(`${config.txOddsBaseUrl}${path}`, {
        headers: { Authorization: `Bearer ${jwt2}`, "X-Api-Token": config.txOddsApiToken, Accept: "application/json" },
      });
      if (!retry.ok) throw new Error(`TxLINE ${path} -> ${retry.status} ${retry.statusText}`);
      return retry.json();
    }
    if (!res.ok) throw new Error(`TxLINE ${path} -> ${res.status} ${res.statusText}`);
    return res.json();
  }

  async listFixtures(): Promise<Fixture[]> {
    const epochDay = Math.floor(Date.now() / 1000 / 86400);
    const comp = config.txOddsCompetitionId ? `&competitionId=${config.txOddsCompetitionId}` : "";
    const data: any[] = await this.get(`/api/fixtures/snapshot?startEpochDay=${epochDay}${comp}`);
    return (data ?? []).map((f) => {
      const p1Home = !!f.Participant1IsHome;
      this.orientation.set(Number(f.FixtureId), p1Home);
      return {
        matchId: Number(f.FixtureId),
        homeTeam: p1Home ? f.Participant1 : f.Participant2,
        awayTeam: p1Home ? f.Participant2 : f.Participant1,
        kickoffTs: Number(f.StartTime), // fixtures StartTime is unix seconds
      };
    });
  }

  async getResult(matchId: number): Promise<MatchResult> {
    const snaps: any[] = await this.get(`/api/scores/snapshot/${matchId}`);
    if (!snaps || snaps.length === 0) {
      return { matchId, state: "scheduled", homeScore: null, awayScore: null };
    }
    // Latest snapshot (the array is the score-event sequence for the fixture).
    const s = snaps[snaps.length - 1];
    const p1Home = this.orientation.get(matchId) ?? true;
    const p1 = s.scoreSoccer?.Participant1?.Total?.Goals ?? null;
    const p2 = s.scoreSoccer?.Participant2?.Total?.Goals ?? null;
    const homeScore = p1 === null || p2 === null ? null : p1Home ? p1 : p2;
    const awayScore = p1 === null || p2 === null ? null : p1Home ? p2 : p1;

    return { matchId, state: mapGameState(s.gameState), homeScore, awayScore };
  }

  async getStatValidation(matchId: number, seq: number, statKeyHome: number, statKeyAway: number): Promise<any | null> {
    // GET /api/scores/stat-validation?fixtureId=&seq=&statKey=&statKey2=
    // Response: { summary, subTreeProof, mainTreeProof, statToProve, eventStatRoot,
    //             statProof, statToProve2, statProof2 }. Field mapping is confirmed
    // against live data in validated.ts::mapValidationArgs.
    const qs = `fixtureId=${matchId}&seq=${seq}&statKey=${statKeyHome}&statKey2=${statKeyAway}`;
    return this.get(`/api/scores/stat-validation?${qs}`);
  }
}

/**
 * Map TxLINE `gameState` to our coarse MatchState. The exact finished/abandoned
 * spellings should be confirmed against live data; we match defensively.
 */
function mapGameState(gameState: unknown): MatchState {
  const g = String(gameState ?? "").toLowerCase();
  if (/abandon|postpon|cancel|suspend|void/.test(g)) return "abandoned";
  if (/full.?time|finished|ended|\bft\b|complete/.test(g)) return "finished";
  if (/live|1st|2nd|half|play|progress/.test(g)) return "live";
  return "scheduled";
}

/**
 * Mock client for demos without an API key. Fixtures kick off shortly after
 * startup and "finish" a bit later with deterministic scores, so a full
 * propose -> finalize cycle can be demonstrated end-to-end offline.
 */
class MockTxOddsClient implements TxOddsClient {
  private readonly start = Math.floor(Date.now() / 1000);
  private readonly fixtures: Fixture[] = [
    { matchId: 9001, homeTeam: "Argentina", awayTeam: "France", kickoffTs: this.start + 60 },
    { matchId: 9002, homeTeam: "Brazil", awayTeam: "England", kickoffTs: this.start + 60 },
    { matchId: 9003, homeTeam: "Spain", awayTeam: "Germany", kickoffTs: this.start + 60 },
  ];
  // Deterministic scripted results, revealed only after "full time".
  private readonly script: Record<number, { home: number; away: number; state: MatchState }> = {
    9001: { home: 3, away: 2, state: "finished" }, // Home
    9002: { home: 1, away: 1, state: "finished" }, // Draw
    9003: { home: 0, away: 0, state: "abandoned" }, // Void
  };

  async listFixtures(): Promise<Fixture[]> {
    return this.fixtures;
  }

  async getResult(matchId: number): Promise<MatchResult> {
    const now = Math.floor(Date.now() / 1000);
    const fx = this.fixtures.find((f) => f.matchId === matchId);
    const scripted = this.script[matchId];
    if (!fx || !scripted) return { matchId, state: "scheduled", homeScore: null, awayScore: null };

    const fullTime = fx.kickoffTs + 30; // mock 30s "match" so the demo settles quickly
    if (now < fx.kickoffTs) return { matchId, state: "scheduled", homeScore: null, awayScore: null };
    if (now < fullTime) return { matchId, state: "live", homeScore: null, awayScore: null };
    return {
      matchId,
      state: scripted.state,
      homeScore: scripted.state === "abandoned" ? null : scripted.home,
      awayScore: scripted.state === "abandoned" ? null : scripted.away,
    };
  }

  // Validated CPI path targets TxLINE's real devnet program; not reproducible
  // on a local mock. Use `commit_result_verified` (mock root) for offline demos.
  async getStatValidation(): Promise<any | null> {
    return null;
  }
}

export function makeTxOddsClient(): TxOddsClient {
  return isMockMode ? new MockTxOddsClient() : new LiveTxOddsClient();
}
