/**
 * Activate a TxLINE World Cup API token on devnet.
 *
 * Flow (per https://txline-docs.txodds.com/documentation/worldcup):
 *   1. subscribe(serviceLevelId, weeks)  -> on-chain subscription (free WC tier, no TxL cost)
 *   2. POST /auth/guest/start            -> guest JWT
 *   3. sign  "${txSig}:${leagues}:${jwt}"  (empty leagues -> "${txSig}::${jwt}")
 *   4. POST /api/token/activate { txSig, walletSignature, leagues } -> X-Api-Token
 *
 * Put the printed token in relayer/.env as TXODDS_API_TOKEN, then the relayer
 * pulls real fixtures/scores and settles via the trustless validate_stat CPI.
 *
 *   PROGRAM_ID=<our program> npm run activate
 *
 * Knobs (env): TXODDS_SERVICE_LEVEL (default 1 = free 60s WC tier), TXODDS_WEEKS (4),
 * TXODDS_LEAGUES (comma-separated; empty = standard bundle), ACTIVATE_KEYPAIR.
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { createPrivateKey, sign as edSign } from "crypto";
import { config, loadKeypair } from "./config";

/** Ed25519-sign `msg` with a Solana secret key, returning a base64 detached signature. */
function signMessage(msg: string, secretKey: Uint8Array): string {
  const pkcs8 = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    Buffer.from(secretKey.slice(0, 32)),
  ]);
  const key = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  return edSign(null, Buffer.from(msg, "utf-8"), key).toString("base64");
}

// TxLINE devnet program + mints (TxL is a Token-2022 mint).
const TXLINE_PROGRAM = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXL_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");

const SERVICE_LEVEL = Number(process.env.TXODDS_SERVICE_LEVEL ?? 1);
const WEEKS = Number(process.env.TXODDS_WEEKS ?? 4);
const LEAGUES = (process.env.TXODDS_LEAGUES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s !== "")
  .map(Number)
  .filter((n) => !Number.isNaN(n));

const log = (...a: any[]) => console.log(...a);
const short = (e: any) => String(e?.message ?? e).split("\n").slice(0, 3).join(" | ").slice(0, 300);

async function guestJwt(): Promise<string> {
  const r = await fetch(`${config.txOddsBaseUrl}/auth/guest/start`, { method: "POST" });
  if (!r.ok) throw new Error(`guest/start ${r.status}: ${await r.text()}`);
  return (await r.json()).token as string;
}

function pda(seed: string): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], TXLINE_PROGRAM)[0];
}

async function main() {
  const signer: Keypair = loadKeypair(process.env.ACTIVATE_KEYPAIR ?? "~/.config/solana/id.json");
  const connection = new Connection(config.rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(signer), { commitment: "confirmed" });

  const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./txline_idl.json"), "utf-8"));
  idl.address = TXLINE_PROGRAM.toBase58();
  const program = new anchor.Program(idl as anchor.Idl, provider) as any;

  log(`\nActivating on ${config.rpcUrl}`);
  log(`wallet ${signer.publicKey.toBase58()}  ·  service level ${SERVICE_LEVEL}  ·  weeks ${WEEKS}  ·  leagues [${LEAGUES.join(",")}]\n`);

  // Derive the subscribe accounts (none carry seeds in the IDL, so resolve them by hand).
  const pricingMatrix = pda("pricing_matrix");
  const tokenTreasuryPda = pda("token_treasury_v2");
  const userTokenAccount = getAssociatedTokenAddressSync(TXL_MINT, signer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const tokenTreasuryVault = getAssociatedTokenAddressSync(TXL_MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID);

  // Ensure the user's TxL (Token-2022) ATA exists — free tier still references it.
  const ensureAta = createAssociatedTokenAccountIdempotentInstruction(
    signer.publicKey, userTokenAccount, signer.publicKey, TXL_MINT, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // 1. subscribe on-chain (or reuse an existing subscription tx via TXODDS_TXSIG).
  let txSig: string;
  if (process.env.TXODDS_TXSIG) {
    txSig = process.env.TXODDS_TXSIG;
    log(`1) reusing subscription: ${txSig}`);
  } else {
    txSig = await program.methods
      .subscribe(SERVICE_LEVEL, WEEKS)
      .accounts({
        user: signer.publicKey,
        pricingMatrix,
        tokenMint: TXL_MINT,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .preInstructions([ensureAta])
      .rpc();
    log(`1) subscribe: ${txSig}`);
    // Give the backend a moment to see the confirmed tx before activating.
    await new Promise((r) => setTimeout(r, 4000));
  }

  // 2. guest JWT.
  const jwt = await guestJwt();
  log(`2) guest JWT ok`);

  // 3. sign the activation challenge: "${txSig}:${leagues}:${jwt}".
  const message = `${txSig}:${LEAGUES.join(",")}:${jwt}`;
  const walletSignature = signMessage(message, signer.secretKey);
  log(`3) signed challenge`);

  // 4. exchange for the long-lived API token (retry transient 5xx/timeout from the gateway).
  let res: Response | null = null;
  let body = "";
  for (let attempt = 1; attempt <= 6; attempt++) {
    res = await fetch(`${config.txOddsBaseUrl}/api/token/activate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ txSig, walletSignature, leagues: LEAGUES }),
    });
    body = await res.text();
    if (res.ok || res.status < 500) break;
    log(`4) token/activate ${res.status} (attempt ${attempt}/6) — retrying in 5s…`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!res || !res.ok) {
    log(`\n4) token/activate ${res?.status}: ${body.slice(0, 400)}`);
    log(`\nSubscription is on-chain (${txSig}). Re-run with TXODDS_TXSIG=${txSig} to retry activation without re-subscribing.`);
    return;
  }
  const token = JSON.parse(body).token;
  log(`\n=== X-Api-Token ===\n${token}\n\nAdd to relayer/.env:\n  TXODDS_API_TOKEN=${token}\n`);
}

main().catch((e) => {
  console.error("activation failed:", short(e));
  process.exit(1);
});
