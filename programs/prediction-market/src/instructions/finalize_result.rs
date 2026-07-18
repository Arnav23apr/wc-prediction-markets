use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::*;
use crate::errors::MarketError;
use crate::settlement::{apply_settlement, transfer_from_vault};
use crate::state::{Market, MarketStatus};

/// Permissionless: once the dispute window has elapsed with no challenge, anyone
/// can lock in the proposed result. Being permissionless matters — settlement
/// must not depend on the oracle staying online after it proposed.
#[derive(Accounts)]
pub struct FinalizeResult<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.match_id.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(mut, address = market.vault @ MarketError::TokenAccountMismatch)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut, address = market.treasury @ MarketError::TokenAccountMismatch)]
    pub treasury: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<FinalizeResult>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let (fee, match_id, bump, outcome) = {
        let market = &mut ctx.accounts.market;
        require!(market.status == MarketStatus::ResultProposed, MarketError::NotAwaitingResult);
        let window_end = market
            .result_commit_ts
            .checked_add(market.dispute_window)
            .ok_or(MarketError::MathOverflow)?;
        require!(now > window_end, MarketError::DisputeWindowOpen);

        let outcome = market.proposed_outcome;
        let fee = apply_settlement(market, outcome)?;
        (fee, market.match_id, market.bump, market.final_outcome)
    };

    if fee > 0 {
        transfer_from_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.vault,
            &ctx.accounts.treasury,
            &ctx.accounts.market,
            match_id,
            bump,
            fee,
        )?;
    }

    emit!(MarketFinalized {
        market: ctx.accounts.market.key(),
        final_outcome: outcome,
        payout_pool: ctx.accounts.market.payout_pool,
        winning_pool: ctx.accounts.market.winning_pool,
        fee,
        voided: ctx.accounts.market.status == MarketStatus::Voided,
    });
    Ok(())
}

#[event]
pub struct MarketFinalized {
    pub market: Pubkey,
    pub final_outcome: u8,
    pub payout_pool: u64,
    pub winning_pool: u64,
    pub fee: u64,
    pub voided: bool,
}
