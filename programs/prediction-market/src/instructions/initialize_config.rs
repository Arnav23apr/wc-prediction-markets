use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::MarketError;
use crate::state::Config;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeConfig>, treasury: Pubkey, default_fee_bps: u16) -> Result<()> {
    require!(default_fee_bps <= MAX_FEE_BPS, MarketError::FeeTooHigh);

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.treasury = treasury;
    config.default_fee_bps = default_fee_bps;
    config.markets_created = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}
