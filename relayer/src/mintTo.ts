/**
 * Mint test USDC to any wallet (e.g. your Phantom address) so you can place bets
 * in the UI. Reuses the persistent admin + mint created by `npm run seed`.
 *
 *   RPC_URL=http://127.0.0.1:8899 npx ts-node src/mintTo.ts <RECIPIENT> [amount]
 *   (npm run mint-to -- <RECIPIENT> [amount])
 */
import * as fs from "fs";
import { Connection, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { config, loadKeypair } from "./config";

async function main() {
  const recipient = process.argv[2];
  const amount = Number(process.argv[3] ?? 1000);
  if (!recipient) throw new Error("usage: mint-to <RECIPIENT_PUBKEY> [amount]");
  if (!fs.existsSync(".demo-admin.json") || !fs.existsSync(".demo-mint.txt")) {
    throw new Error("run `npm run seed` first (creates .demo-admin.json + .demo-mint.txt)");
  }

  const conn = new Connection(config.rpcUrl, "confirmed");
  const admin = loadKeypair(".demo-admin.json");
  const mint = new PublicKey(fs.readFileSync(".demo-mint.txt", "utf-8").trim());
  const owner = new PublicKey(recipient);

  const ata = await getOrCreateAssociatedTokenAccount(conn, admin, mint, owner);
  await mintTo(conn, admin, mint, ata.address, admin, BigInt(Math.round(amount * 1e6)));
  console.log(`Minted ${amount} test USDC to ${recipient}`);
  console.log(`(mint ${mint.toBase58()})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
