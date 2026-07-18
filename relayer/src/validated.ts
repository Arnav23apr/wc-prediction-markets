/**
 * Trustless settlement via CPI into TxLINE's own `validate_stat`.
 *
 * Maps the `GET /api/scores/stat-validation` two-stat response into the
 * `commit_result_validated` instruction args, and submits it with TxLINE's
 * anchored daily-roots PDA account. No mirrored root, no oracle key — TxLINE's
 * program verifies the goals against its own on-chain data.
 *
 * NOTE: the exact response field names (summary / subTreeProof / statProof2 …)
 * and the goal `statKey`s must be confirmed against a live World Cup response;
 * they are read defensively here and centralised so a single edit aligns them.
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Ctx, marketPda } from "./program";

// TxLINE oracle program — devnet. Mainnet: 9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA
export const TXLINE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

/** TxLINE's anchored batch-root PDA for a given epoch day (days since unix epoch). */
export function dailyRootsPda(epochDay: number): PublicKey {
  const seed = Buffer.alloc(2);
  seed.writeUInt16LE(epochDay & 0xffff);
  return PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), seed], TXLINE_PROGRAM_ID)[0];
}

const pick = (o: any, ...keys: string[]) => keys.map((k) => o?.[k]).find((v) => v !== undefined);

function parseHash(s: any): number[] {
  if (Array.isArray(s)) return s;
  if (Buffer.isBuffer(s)) return Array.from(s);
  let buf = Buffer.from(String(s), "base64");
  if (buf.length !== 32) buf = Buffer.from(String(s), "hex");
  if (buf.length !== 32) throw new Error(`unexpected hash length ${buf.length}`);
  return Array.from(buf);
}
const mapProof = (p: any[]): { hash: number[]; isRightSibling: boolean }[] =>
  (p ?? []).map((n) => ({ hash: parseHash(pick(n, "hash", "Hash")), isRightSibling: !!pick(n, "isRightSibling", "IsRightSibling") }));

const toStat = (s: any) => ({
  key: Number(pick(s, "key", "Key")),
  value: Number(pick(s, "value", "Value")),
  period: Number(pick(s, "period", "Period")),
});

export interface ValidatedArgs {
  proposedOutcome: number;
  ts: BN;
  fixtureSummary: { fixtureId: BN; updateStats: { updateCount: number; minTimestamp: BN; maxTimestamp: BN }; eventsSubTreeRoot: number[] };
  fixtureProof: { hash: number[]; isRightSibling: boolean }[];
  mainTreeProof: { hash: number[]; isRightSibling: boolean }[];
  statHome: { statToProve: any; eventStatRoot: number[]; statProof: any[] };
  statAway: { statToProve: any; eventStatRoot: number[]; statProof: any[] };
}

/** Convert a two-stat `stat-validation` response into instruction args. */
export function mapValidationArgs(resp: any): ValidatedArgs {
  const summary = pick(resp, "summary", "Summary") ?? {};
  const us = pick(summary, "updateStats", "update_stats", "UpdateStats") ?? {};
  const eventStatRoot = parseHash(pick(resp, "eventStatRoot", "EventStatRoot"));
  const home = toStat(pick(resp, "statToProve", "StatToProve"));
  const away = toStat(pick(resp, "statToProve2", "StatToProve2"));
  const maxTs = Number(pick(us, "maxTimestamp", "max_timestamp", "MaxTimestamp") ?? Math.floor(Date.now() / 1000));

  return {
    proposedOutcome: home.value > away.value ? 0 : home.value < away.value ? 2 : 1,
    ts: new BN(maxTs),
    fixtureSummary: {
      fixtureId: new BN(Number(pick(summary, "fixtureId", "fixture_id", "FixtureId") ?? 0)),
      updateStats: {
        updateCount: Number(pick(us, "updateCount", "update_count", "UpdateCount") ?? 0),
        minTimestamp: new BN(Number(pick(us, "minTimestamp", "min_timestamp", "MinTimestamp") ?? 0)),
        maxTimestamp: new BN(maxTs),
      },
      eventsSubTreeRoot: parseHash(pick(summary, "eventsSubTreeRoot", "events_sub_tree_root", "EventsSubTreeRoot")),
    },
    fixtureProof: mapProof(pick(resp, "subTreeProof", "SubTreeProof")),
    mainTreeProof: mapProof(pick(resp, "mainTreeProof", "MainTreeProof")),
    statHome: { statToProve: home, eventStatRoot, statProof: mapProof(pick(resp, "statProof", "StatProof")) },
    statAway: { statToProve: away, eventStatRoot, statProof: mapProof(pick(resp, "statProof2", "StatProof2")) },
  };
}

/** Submit `commit_result_validated` — CPIs TxLINE `validate_stat` on-chain. */
export async function commitResultValidated(ctx: Ctx, matchId: number, args: ValidatedArgs): Promise<string> {
  const market = marketPda(matchId);
  const epochDay = Math.floor(args.ts.toNumber() / 86400);
  return ctx.program.methods
    .commitResultValidated(
      args.proposedOutcome,
      args.ts,
      args.fixtureSummary,
      args.fixtureProof,
      args.mainTreeProof,
      args.statHome,
      args.statAway
    )
    .accounts({
      submitter: ctx.signer.publicKey,
      market,
      dailyScoresRoots: dailyRootsPda(epochDay),
      txlineProgram: TXLINE_PROGRAM_ID,
    })
    .rpc();
}
