use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::MarketError;
use crate::state::{Market, MarketStatus};

/// During the dispute window, the designated watcher can freeze a proposed
/// result (e.g. the oracle posted a score that contradicts the scout feed).
/// Freezing hands resolution to the market admin — funds never move on a dispute.
#[derive(Accounts)]
pub struct DisputeResult<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.match_id.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(address = market.dispute_authority @ MarketError::NoProposedResult)]
    pub dispute_authority: Signer<'info>,
}

pub fn handler(ctx: Context<DisputeResult>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;

    require!(market.status == MarketStatus::ResultProposed, MarketError::NoProposedResult);
    let window_end = market
        .result_commit_ts
        .checked_add(market.dispute_window)
        .ok_or(MarketError::MathOverflow)?;
    require!(now <= window_end, MarketError::DisputeWindowClosed);

    market.status = MarketStatus::Disputed;

    emit!(ResultDisputed {
        market: market.key(),
        disputed_outcome: market.proposed_outcome,
        disputed_at: now,
    });
    Ok(())
}

#[event]
pub struct ResultDisputed {
    pub market: Pubkey,
    pub disputed_outcome: u8,
    pub disputed_at: i64,
}
