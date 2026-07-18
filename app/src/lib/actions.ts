import { BN, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MarketData, toBase } from "./markets";
import { positionPda } from "./pdas";

export async function placeBet(
  program: Program<Idl>,
  market: MarketData,
  owner: PublicKey,
  outcome: number,
  uiAmount: number
): Promise<string> {
  const ata = getAssociatedTokenAddressSync(market.usdcMint, owner);
  return program.methods
    .placeBet(outcome, new BN(toBase(uiAmount)))
    .accounts({
      bettor: owner,
      market: market.pubkey,
      position: positionPda(market.pubkey, owner),
      vault: market.vault,
      bettorTokenAccount: ata,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function claim(
  program: Program<Idl>,
  market: MarketData,
  owner: PublicKey
): Promise<string> {
  const ata = getAssociatedTokenAddressSync(market.usdcMint, owner);
  return program.methods
    .claim()
    .accounts({
      claimant: owner,
      market: market.pubkey,
      position: positionPda(market.pubkey, owner),
      vault: market.vault,
      claimantTokenAccount: ata,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}
