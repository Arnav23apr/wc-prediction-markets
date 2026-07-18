use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::{MARKET_SEED, POSITION_SEED};
use crate::errors::MarketError;
use crate::settlement::{position_payout, transfer_from_vault};
use crate::state::{Market, MarketStatus, Position};

/// Pull winnings (Settled) or refund (Voided). Idempotent per position via the
/// `claimed` flag; permissionless to call but always pays the position owner.
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.match_id.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        has_one = market @ MarketError::TokenAccountMismatch,
        constraint = position.owner == claimant.key() @ MarketError::NotPositionOwner,
        seeds = [POSITION_SEED, market.key().as_ref(), claimant.key().as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    #[account(mut, address = market.vault @ MarketError::TokenAccountMismatch)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = market.usdc_mint,
        token::authority = claimant,
    )]
    pub claimant_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    // Must be in a terminal state.
    {
        let status = ctx.accounts.market.status;
        require!(
            status == MarketStatus::Settled || status == MarketStatus::Voided,
            MarketError::NotSettled
        );
    }
    require!(!ctx.accounts.position.claimed, MarketError::AlreadyClaimed);

    let payout = position_payout(
        &ctx.accounts.market,
        &ctx.accounts.position.stakes,
        ctx.accounts.position.total_stake,
    )?;
    require!(payout > 0, MarketError::NothingToClaim);

    // Mark claimed before transferring (defensive ordering).
    ctx.accounts.position.claimed = true;

    let (match_id, bump) = {
        let market = &mut ctx.accounts.market;
        market.claimed_amount = market
            .claimed_amount
            .checked_add(payout)
            .ok_or(MarketError::MathOverflow)?;
        (market.match_id, market.bump)
    };

    transfer_from_vault(
        &ctx.accounts.token_program,
        &ctx.accounts.vault,
        &ctx.accounts.claimant_token_account,
        &ctx.accounts.market,
        match_id,
        bump,
        payout,
    )?;

    emit!(Claimed {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.claimant.key(),
        amount: payout,
        refund: ctx.accounts.market.status == MarketStatus::Voided,
    });
    Ok(())
}

#[event]
pub struct Claimed {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub refund: bool,
}
