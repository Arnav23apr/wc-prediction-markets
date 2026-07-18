import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { config, loadKeypair } from "./config";

const IDL_PATH = path.resolve(__dirname, "../../target/idl/prediction_market.json");

export interface Ctx {
  connection: Connection;
  provider: anchor.AnchorProvider;
  program: anchor.Program<anchor.Idl>;
  signer: Keypair;
}

/** Build an Anchor context using the given signer (oracle or admin). */
export function buildCtx(signer: Keypair): Ctx {
  if (!fs.existsSync(IDL_PATH)) {
    throw new Error(`IDL not found at ${IDL_PATH}. Run \`anchor build\` first.`);
  }
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  idl.address = config.programId.toBase58(); // keep IDL address in sync with .env

  const connection = new Connection(config.rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(signer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl as anchor.Idl, provider);
  return { connection, provider, program, signer };
}

export function oracleCtx(): Ctx {
  return buildCtx(loadKeypair(config.oracleKeypairPath));
}

// --- PDA derivations (mirror constants.rs) ---
const enc = (s: string) => Buffer.from(s);
const u64le = (n: number | bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

export function marketPda(matchId: number | bigint): PublicKey {
  return PublicKey.findProgramAddressSync([enc("market"), u64le(matchId)], config.programId)[0];
}

export function vaultPda(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([enc("vault"), market.toBuffer()], config.programId)[0];
}

export function positionPda(market: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("position"), market.toBuffer(), owner.toBuffer()],
    config.programId
  )[0];
}
