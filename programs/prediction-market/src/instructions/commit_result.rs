use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::MarketError;
use crate::state::{Market, MarketStatus};

/// The TxODDS relayer (oracle key) proposes the full-time result once the match
/// is over. This does NOT pay anyone out — it starts the dispute window. The
/// separation of "propose" from "finalize" is the heart of the settlement design.
#[derive(Accounts)]
pub struct CommitResult<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.match_id.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(address = market.oracle @ MarketError::NotAwaitingResult)]
    pub oracle: Signer<'info>,
}

pub fn handler(ctx: Context<CommitResult>, outcome: u8) -> Result<()> {
    let valid = (outcome as usize) < NUM_OUTCOMES || outcome == OUTCOME_VOID;
    require!(valid, MarketError::InvalidResolution);

    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Open, MarketError::MarketNotOpen);
    require!(now >= market.betting_close_ts, MarketError::BettingStillOpen);

    market.proposed_outcome = outcome;
    market.result_commit_ts = now;
    market.status = MarketStatus::ResultProposed;

    emit!(ResultProposed {
        market: market.key(),
        outcome,
        commit_ts: now,
        dispute_window_ends: now.saturating_add(market.dispute_window),
    });
    Ok(())
}

#[event]
pub struct ResultProposed {
    pub market: Pubkey,
    pub outcome: u8,
    pub commit_ts: i64,
    pub dispute_window_ends: i64,
}
