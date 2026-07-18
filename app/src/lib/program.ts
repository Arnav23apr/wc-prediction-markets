import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import idl from "@/idl/prediction_market.json";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

// `address` is written into the IDL by `anchor build`.
export const PROGRAM_ID = new PublicKey((idl as any).address);

export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

/** Anchor program bound to a connected wallet (for sending txns). */
export function getProgram(wallet: AnchorWallet): Program<Idl> {
  const provider = new AnchorProvider(getConnection(), wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
}

/** Read-only program (no wallet) for fetching account data. */
export function getReadonlyProgram(): Program<Idl> {
  const provider = new AnchorProvider(
    getConnection(),
    // dummy wallet; never signs
    { publicKey: PublicKey.default } as any,
    { commitment: "confirmed" }
  );
  return new Program(idl as Idl, provider);
}
