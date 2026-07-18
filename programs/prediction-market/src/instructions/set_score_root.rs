use anchor_lang::prelude::*;

use crate::constants::ROOT_REGISTRY_SEED;
use crate::errors::MarketError;
use crate::state::RootRegistry;

/// Publish/refresh the trusted TxLINE batch root. Called by the root authority
/// (TxLINE's publisher, or a relayer mirroring their on-chain root) each batch.
#[derive(Accounts)]
pub struct SetScoreRoot<'info> {
    #[account(
        mut,
        seeds = [ROOT_REGISTRY_SEED],
        bump = registry.bump,
    )]
    pub registry: Account<'info, RootRegistry>,

    #[account(address = registry.authority @ MarketError::NotRootAuthority)]
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<SetScoreRoot>, root: [u8; 32]) -> Result<()> {
    let r = &mut ctx.accounts.registry;
    r.root = root;
    r.updated_at = Clock::get()?.unix_timestamp;

    emit!(ScoreRootUpdated { root, updated_at: r.updated_at });
    Ok(())
}

#[event]
pub struct ScoreRootUpdated {
    pub root: [u8; 32],
    pub updated_at: i64,
}
