/**
 * One-shot devnet bootstrap so you don't have to wire test infra by hand.
 *
 *   ts-node src/setupDevnet.ts
 *
 * Creates a test USDC-style mint, your treasury token account, an oracle keypair
 * (if missing), mints some test tokens to you, and prints the .env values to paste.
 */
import * as fs from "fs";
import { Keypair } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
import { config, loadKeypair } from "./config";

async function main() {
  const connection = new Connection(config.rpcUrl, "confirmed");
  const admin = loadKeypair(config.adminKeypairPath);
  console.log("Admin:", admin.publicKey.toBase58());

  // Oracle keypair
  if (!fs.existsSync(config.oracleKeypairPath)) {
    const oracle = Keypair.generate();
    fs.writeFileSync(config.oracleKeypairPath, JSON.stringify(Array.from(oracle.secretKey)));
    console.log(`Generated oracle keypair -> ${config.oracleKeypairPath} (${oracle.publicKey.toBase58()})`);
  }
  const oracle = loadKeypair(config.oracleKeypairPath);

  // Fund oracle a little so it can pay tx fees when proposing results.
  try {
    const sig = await connection.requestAirdrop(oracle.publicKey, 1_000_000_000);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("Airdropped 1 SOL to oracle");
  } catch {
    console.log("Oracle airdrop skipped (rate limited?) — fund it manually if needed");
  }

  // Test USDC mint (6 decimals)
  const mint = await createMint(connection, admin, admin.publicKey, null, 6);
  const treasury = await getOrCreateAssociatedTokenAccount(connection, admin, mint, admin.publicKey);
  await mintTo(connection, admin, mint, treasury.address, admin, BigInt(1_000_000 * 10 ** 6));
  console.log("Minted 1,000,000 test USDC to your treasury ATA");

  console.log("\nPaste into relayer/.env :\n");
  console.log(`USDC_MINT=${mint.toBase58()}`);
  console.log(`TREASURY_TOKEN_ACCOUNT=${treasury.address.toBase58()}`);
  console.log(`ORACLE_KEYPAIR=${config.oracleKeypairPath}`);
  console.log(`\nAnd into app/.env.local :\n`);
  console.log(`NEXT_PUBLIC_USDC_MINT=${mint.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
