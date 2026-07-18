use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::MarketError;
use crate::state::{Market, MarketStatus, Position};

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.match_id.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, market.key().as_ref(), bettor.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    #[account(mut, address = market.vault @ MarketError::TokenAccountMismatch)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = market.usdc_mint,
        token::authority = bettor,
    )]
    pub bettor_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PlaceBet>, outcome: u8, amount: u64) -> Result<()> {
    require!((outcome as usize) < NUM_OUTCOMES, MarketError::InvalidOutcome);
    require!(amount > 0, MarketError::ZeroAmount);

    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Open, MarketError::MarketNotOpen);
    require!(now < market.betting_close_ts, MarketError::BettingClosed);

    // Move stake into escrow first; everything after is bookkeeping.
    let cpi = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.bettor_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.bettor.to_account_info(),
        },
    );
    token::transfer(cpi, amount)?;

    let position = &mut ctx.accounts.position;
    // First-touch initialisation (init_if_needed gives zeroed state).
    if position.owner == Pubkey::default() {
        position.market = market.key();
        position.owner = ctx.accounts.bettor.key();
        position.stakes = [0; NUM_OUTCOMES];
        position.total_stake = 0;
        position.claimed = false;
        position.bump = ctx.bumps.position;
        market.num_bettors = market.num_bettors.checked_add(1).ok_or(MarketError::MathOverflow)?;
    }

    let idx = outcome as usize;
    position.stakes[idx] = position.stakes[idx].checked_add(amount).ok_or(MarketError::MathOverflow)?;
    position.total_stake = position.total_stake.checked_add(amount).ok_or(MarketError::MathOverflow)?;

    market.pools[idx] = market.pools[idx].checked_add(amount).ok_or(MarketError::MathOverflow)?;
    market.total_pool = market.total_pool.checked_add(amount).ok_or(MarketError::MathOverflow)?;

    emit!(BetPlaced {
        market: market.key(),
        bettor: ctx.accounts.bettor.key(),
        outcome,
        amount,
        new_total_pool: market.total_pool,
    });
    Ok(())
}

#[event]
pub struct BetPlaced {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub outcome: u8,
    pub amount: u64,
    pub new_total_pool: u64,
}
