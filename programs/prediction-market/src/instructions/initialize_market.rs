use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::errors::MarketError;
use crate::state::{Market, MarketStatus};

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    // Boxed to keep them off the instruction's BPF stack frame (the Market
    // account is large enough that an unboxed `init` blows the 4KB limit).
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, match_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Box<Account<'info, Market>>,

    pub usdc_mint: Box<Account<'info, Mint>>,

    /// Program-owned escrow, authority = market PDA.
    #[account(
        init,
        payer = authority,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = market,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// Destination for the protocol fee at settlement. Must hold the same mint.
    #[account(token::mint = usdc_mint)]
    pub treasury: Box<Account<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<InitializeMarket>,
    match_id: u64,
    betting_close_ts: i64,
    dispute_window: i64,
    fee_bps: u16,
    oracle: Pubkey,
    dispute_authority: Pubkey,
    home_team: String,
    away_team: String,
) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, MarketError::FeeTooHigh);
    require!(
        (MIN_DISPUTE_WINDOW..=MAX_DISPUTE_WINDOW).contains(&dispute_window),
        MarketError::InvalidDisputeWindow
    );
    require!(
        betting_close_ts > Clock::get()?.unix_timestamp,
        MarketError::InvalidBettingClose
    );
    require!(home_team.len() <= TEAM_NAME_MAX_LEN, MarketError::InvalidOutcome);
    require!(away_team.len() <= TEAM_NAME_MAX_LEN, MarketError::InvalidOutcome);

    let market = &mut ctx.accounts.market;
    market.match_id = match_id;
    market.authority = ctx.accounts.authority.key();
    market.oracle = oracle;
    market.dispute_authority = dispute_authority;
    market.usdc_mint = ctx.accounts.usdc_mint.key();
    market.vault = ctx.accounts.vault.key();
    market.treasury = ctx.accounts.treasury.key();
    market.betting_close_ts = betting_close_ts;
    market.dispute_window = dispute_window;
    market.result_commit_ts = 0;
    market.pools = [0; NUM_OUTCOMES];
    market.total_pool = 0;
    market.payout_pool = 0;
    market.winning_pool = 0;
    market.fee_collected = 0;
    market.claimed_amount = 0;
    market.num_bettors = 0;
    market.fee_bps = fee_bps;
    market.status = MarketStatus::Open;
    market.proposed_outcome = OUTCOME_NONE;
    market.final_outcome = OUTCOME_NONE;
    market.bump = ctx.bumps.market;
    market.vault_bump = ctx.bumps.vault;
    market.home_team = home_team;
    market.away_team = away_team;
    market.result_verified = false;
    market.home_goals = 0;
    market.away_goals = 0;
    Ok(())
}
