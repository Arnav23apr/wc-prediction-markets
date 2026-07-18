use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::MarketError;
use crate::state::{Market, MarketStatus};
use crate::txline_cpi::{
    self, BinaryExpression, Comparison, ScoresBatchSummary, StatTerm, TraderPredicate,
    TxProofNode, TXLINE_PROGRAM_ID,
};

/// Propose the result by asking TxLINE's OWN program to validate the goal totals
/// against its Solana-anchored daily root (CPI into `validate_stat`).
///
/// This is the strongest trust model in the program: there is no mirrored root
/// and no oracle key — the proposer supplies TxLINE's `stat-validation` proof for
/// the home and away goals, we build the `home - away <cmp> 0` predicate for the
/// proposed outcome, and TxLINE's program returns whether it holds against its own
/// anchored data. A submitter can only ever push through the *true* outcome.
#[derive(Accounts)]
pub struct CommitResultValidated<'info> {
    /// Any fee payer — the CPI result is what's trusted.
    pub submitter: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.match_id.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    /// CHECK: verified below to be TxLINE's daily-roots PDA for the proof's day.
    pub daily_scores_roots: UncheckedAccount<'info>,

    /// CHECK: address-checked against the TxLINE oracle program id.
    #[account(address = TXLINE_PROGRAM_ID @ MarketError::TxlineRootMismatch)]
    pub txline_program: UncheckedAccount<'info>,
}

#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<CommitResultValidated>,
    proposed_outcome: u8,
    ts: i64,
    fixture_summary: ScoresBatchSummary,
    fixture_proof: Vec<TxProofNode>,
    main_tree_proof: Vec<TxProofNode>,
    stat_home: StatTerm,
    stat_away: StatTerm,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(
        ctx.accounts.market.status == MarketStatus::Open,
        MarketError::MarketNotOpen
    );
    require!(
        now >= ctx.accounts.market.betting_close_ts,
        MarketError::BettingStillOpen
    );

    // The roots account must be TxLINE's anchored PDA for the proof's epoch day.
    let epoch_day = ts.div_euclid(86_400) as u16;
    require_keys_eq!(
        ctx.accounts.daily_scores_roots.key(),
        txline_cpi::daily_roots_pda(epoch_day),
        MarketError::TxlineRootMismatch
    );

    // Predicate for the proposed outcome: (home - away)  <cmp>  0.
    let comparison = match proposed_outcome {
        OUTCOME_HOME => Comparison::GreaterThan,
        OUTCOME_AWAY => Comparison::LessThan,
        OUTCOME_DRAW => Comparison::EqualTo,
        _ => return err!(MarketError::InvalidResolution),
    };
    let predicate = TraderPredicate { threshold: 0, comparison };

    let home_val = stat_home.stat_to_prove.value as i64;
    let away_val = stat_away.stat_to_prove.value as i64;

    let ok = txline_cpi::validate_stat(
        ctx.accounts.txline_program.to_account_info(),
        ctx.accounts.daily_scores_roots.to_account_info(),
        ts,
        fixture_summary,
        fixture_proof,
        main_tree_proof,
        predicate,
        stat_home,
        Some(stat_away),
        Some(BinaryExpression::Subtract),
    )?;
    require!(ok, MarketError::TxlineValidationFailed);

    let market = &mut ctx.accounts.market;
    market.proposed_outcome = proposed_outcome;
    market.result_commit_ts = now;
    market.status = MarketStatus::ResultProposed;
    market.result_verified = true;
    market.home_goals = home_val;
    market.away_goals = away_val;

    emit!(ResultValidated {
        market: market.key(),
        outcome: proposed_outcome,
        home_goals: home_val,
        away_goals: away_val,
        commit_ts: now,
        dispute_window_ends: now.saturating_add(market.dispute_window),
    });
    Ok(())
}

#[event]
pub struct ResultValidated {
    pub market: Pubkey,
    pub outcome: u8,
    pub home_goals: i64,
    pub away_goals: i64,
    pub commit_ts: i64,
    pub dispute_window_ends: i64,
}
