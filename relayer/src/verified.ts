/**
 * TxLINE Merkle-proof → on-chain `commit_result_verified` args.
 *
 * Maps the `GET /api/scores/stat-validation` response (proving two stats — the
 * home and away goal totals — against a published batch root) into the structs
 * the program expects. Also provides a self-consistent MOCK generator so the
 * verified-settlement flow can be demoed without a live API token.
 *
 * NOTE: keep the hashing here identical to programs/.../merkle.rs (SHA-256,
 * domain-separated, i64 LE). If TxLINE's real leaf encoding/hash differs, change
 * BOTH places together — nothing else in the pipeline depends on it.
 */
import { BN } from "@coral-xyz/anchor";
import * as crypto from "crypto";

export interface Stat { key: number; value: number; period: number }
export interface ProofNode { hash: number[]; isRightSibling: boolean }
export interface VerifiedArgs {
  homeGoals: { key: BN; value: BN; period: BN };
  awayGoals: { key: BN; value: BN; period: BN };
  homeProof: ProofNode[];
  awayProof: ProofNode[];
  subTreeProof: ProofNode[];
  mainTreeProof: ProofNode[];
}

const toScore = (s: Stat) => ({ key: new BN(s.key), value: new BN(s.value), period: new BN(s.period) });

// "binary" fields arrive base64 (fallback hex). Always normalise to 32-byte arrays.
function parseHash(s: string | number[] | Buffer): number[] {
  if (Array.isArray(s)) return s;
  if (Buffer.isBuffer(s)) return Array.from(s);
  let buf = Buffer.from(s, "base64");
  if (buf.length !== 32) buf = Buffer.from(s, "hex");
  if (buf.length !== 32) throw new Error(`unexpected hash length ${buf.length} for ${s}`);
  return Array.from(buf);
}
const mapProof = (p: any[]): ProofNode[] =>
  (p ?? []).map((n) => ({ hash: parseHash(n.hash), isRightSibling: !!n.isRightSibling }));

/**
 * Map a TxLINE two-stat proof. The relayer requests statKey=<home goals>,
 * statKey2=<away goals>, so statToProve=home and statToProve2=away.
 */
export function txProofToArgs(proof: any): VerifiedArgs {
  if (!proof.statToProve2 || !proof.statProof2) {
    throw new Error("expected a two-stat proof (pass statKey2 for the away goals)");
  }
  return {
    homeGoals: toScore({ key: proof.statToProve.key, value: proof.statToProve.value, period: proof.statToProve.period }),
    awayGoals: toScore({ key: proof.statToProve2.key, value: proof.statToProve2.value, period: proof.statToProve2.period }),
    homeProof: mapProof(proof.statProof),
    awayProof: mapProof(proof.statProof2),
    subTreeProof: mapProof(proof.subTreeProof),
    mainTreeProof: mapProof(proof.mainTreeProof),
  };
}

// ---- mock generator (mirrors merkle.rs + the tests) ----
const sha256 = (...b: Buffer[]) => crypto.createHash("sha256").update(Buffer.concat(b)).digest();
const i64le = (n: number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; };
const leafHash = (s: Stat) => sha256(Buffer.from([0]), i64le(s.key), i64le(s.value), i64le(s.period));
const nodeHash = (l: Buffer, r: Buffer) => sha256(Buffer.from([1]), l, r);

/**
 * Build a self-consistent tree for a (home, away) goal pair. Returns the
 * instruction args plus the batch root to publish via `set_score_root`.
 */
export function mockProof(homeValue: number, awayValue: number): { args: VerifiedArgs; root: number[] } {
  const home: Stat = { key: 1, value: homeValue, period: 0 };
  const away: Stat = { key: 2, value: awayValue, period: 0 };
  const subSibling = crypto.randomBytes(32);
  const mainSibling = crypto.randomBytes(32);
  const eventRoot = nodeHash(leafHash(home), leafHash(away));
  const subRoot = nodeHash(eventRoot, subSibling);
  const batchRoot = nodeHash(mainSibling, subRoot);
  const N = (h: Buffer, right: boolean): ProofNode => ({ hash: Array.from(h), isRightSibling: right });
  return {
    args: {
      homeGoals: toScore(home),
      awayGoals: toScore(away),
      homeProof: [N(leafHash(away), true)],
      awayProof: [N(leafHash(home), false)],
      subTreeProof: [N(subSibling, true)],
      mainTreeProof: [N(mainSibling, false)],
    },
    root: Array.from(batchRoot),
  };
}
