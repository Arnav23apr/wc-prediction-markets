import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Ctx, marketPda, vaultPda } from "./program";

// Market status enum keys as serialized by Anchor.
type StatusKey = "open" | "resultProposed" | "disputed" | "settled" | "voided";

export interface MarketView {
  matchId: number;
  status: StatusKey;
  proposedOutcome: number;
  resultCommitTs: number;
  disputeWindow: number;
  treasury: any;
}

export async function fetchMarket(ctx: Ctx, matchId: number): Promise<MarketView | null> {
  const pda = marketPda(matchId);
  const acc = await (ctx.program.account as any).market.fetchNullable(pda);
  if (!acc) return null;
  return {
    matchId,
    status: Object.keys(acc.status)[0] as StatusKey,
    proposedOutcome: acc.proposedOutcome,
    resultCommitTs: Number(acc.resultCommitTs),
    disputeWindow: Number(acc.disputeWindow),
    treasury: acc.treasury,
  };
}

/** Propose a result on-chain (oracle-signed). Starts the dispute window. */
export async function commitResult(ctx: Ctx, matchId: number, outcome: number): Promise<string> {
  const market = marketPda(matchId);
  return ctx.program.methods
    .commitResult(outcome)
    .accounts({ market, oracle: ctx.signer.publicKey })
    .rpc();
}

/** Finalize after the dispute window elapses (permissionless). */
export async function finalizeResult(ctx: Ctx, matchId: number, treasury: any): Promise<string> {
  const market = marketPda(matchId);
  return ctx.program.methods
    .finalizeResult()
    .accounts({
      market,
      vault: vaultPda(market),
      treasury,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

export function disputeWindowEnded(m: MarketView, nowTs: number): boolean {
  return nowTs > m.resultCommitTs + m.disputeWindow;
}
