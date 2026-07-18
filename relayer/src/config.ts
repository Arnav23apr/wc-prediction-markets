import * as dotenv from "dotenv";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Keypair, PublicKey } from "@solana/web3.js";

dotenv.config();

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function loadKeypair(p: string): Keypair {
  const resolved = p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

/** Load a keypair from disk, creating + persisting one if it doesn't exist. */
export function loadOrCreateKeypair(p: string): Keypair {
  if (fs.existsSync(p)) return loadKeypair(p);
  const kp = Keypair.generate();
  fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

export const config = {
  rpcUrl: process.env.RPC_URL ?? "https://api.devnet.solana.com",
  programId: new PublicKey(req("PROGRAM_ID")),
  oracleKeypairPath: process.env.ORACLE_KEYPAIR ?? "./oracle.json",

  // TxLINE (txodds) — see https://txline.txodds.com/documentation/quickstart
  txOddsBaseUrl: process.env.TXODDS_BASE_URL ?? "https://txline.txodds.com",
  // Long-lived API token from the activate-subscription flow. Empty => MOCK mode.
  txOddsApiToken: process.env.TXODDS_API_TOKEN ?? "",
  // Optional: paste a guest JWT, otherwise we fetch one from /auth/guest/start.
  txOddsGuestJwt: process.env.TXODDS_GUEST_JWT ?? "",
  // World Cup competition id (filters the fixtures snapshot). Empty => no filter.
  txOddsCompetitionId: process.env.TXODDS_COMPETITION_ID ?? "",
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 15000),

  // Trustless (validate_stat CPI) settlement path.
  //   useValidated=true  -> resolve by CPI into TxLINE's validate_stat (default in LIVE mode)
  //   statKey*           -> the TxLINE stat keys for full-time home/away goal totals
  //   scoreSeq           -> stat-validation sequence number (confirm against live schema)
  useValidated: (process.env.TXODDS_USE_VALIDATED ?? "true").toLowerCase() !== "false",
  txStatKeyHome: Number(process.env.TXODDS_STAT_KEY_HOME ?? 1),
  txStatKeyAway: Number(process.env.TXODDS_STAT_KEY_AWAY ?? 2),
  txScoreSeq: Number(process.env.TXODDS_SCORE_SEQ ?? 0),

  // create-market.ts only
  adminKeypairPath: process.env.ADMIN_KEYPAIR ?? "~/.config/solana/id.json",
  usdcMint: process.env.USDC_MINT ?? "",
  treasuryTokenAccount: process.env.TREASURY_TOKEN_ACCOUNT ?? "",
  defaultFeeBps: Number(process.env.DEFAULT_FEE_BPS ?? 200),
  defaultDisputeWindow: Number(process.env.DEFAULT_DISPUTE_WINDOW ?? 3600),
};

export const isMockMode = config.txOddsApiToken.trim() === "";
