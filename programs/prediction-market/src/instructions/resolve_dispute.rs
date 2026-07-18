use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::*;
use crate::errors::MarketError;
use crate::settlement::{apply_settlement, transfer_from_vault};
use crate::state::{Market, MarketStatus};

/// Admin override for a disputed market. The admin supplies the authoritative
/// outcome (which may differ from what the oracle proposed, or be VOID). This is
/// the only privileged settlement path and only reachable from `Disputed`.
#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.match_id.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(address = market.authority @ MarketError::NotDisputed)]
    pub authority: Signer<'info>,

    #[account(mut, address = market.vault @ MarketError::TokenAccountMismatch)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut, address = market.treasury @ MarketError::TokenAccountMismatch)]
    pub treasury: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ResolveDispute>, final_outcome: u8) -> Result<()> {
    let valid = (final_outcome as usize) < NUM_OUTCOMES || final_outcome == OUTCOME_VOID;
    require!(valid, MarketError::InvalidResolution);

    let (fee, match_id, bump, outcome) = {
        let market = &mut ctx.accounts.market;
        require!(market.status == MarketStatus::Disputed, MarketError::NotDisputed);
        let fee = apply_settlement(market, final_outcome)?;
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

    emit!(DisputeResolved {
        market: ctx.accounts.market.key(),
        final_outcome: outcome,
        voided: ctx.accounts.market.status == MarketStatus::Voided,
    });
    Ok(())
}

#[event]
pub struct DisputeResolved {
    pub market: Pubkey,
    pub final_outcome: u8,
    pub voided: bool,
}
