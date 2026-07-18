import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./program";

const enc = (s: string) => new TextEncoder().encode(s);

function u64le(n: number | bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}

export function marketPda(matchId: number | bigint): PublicKey {
  return PublicKey.findProgramAddressSync([enc("market"), u64le(matchId)], PROGRAM_ID)[0];
}

export function vaultPda(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([enc("vault"), market.toBuffer()], PROGRAM_ID)[0];
}

export function positionPda(market: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("position"), market.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}
