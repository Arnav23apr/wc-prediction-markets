use anchor_lang::prelude::*;

use crate::constants::ROOT_REGISTRY_SEED;
use crate::state::RootRegistry;

#[derive(Accounts)]
pub struct InitRootRegistry<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + RootRegistry::INIT_SPACE,
        seeds = [ROOT_REGISTRY_SEED],
        bump
    )]
    pub registry: Account<'info, RootRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitRootRegistry>, authority: Pubkey) -> Result<()> {
    let r = &mut ctx.accounts.registry;
    r.authority = authority;
    r.root = [0u8; 32];
    r.updated_at = 0;
    r.bump = ctx.bumps.registry;
    Ok(())
}
