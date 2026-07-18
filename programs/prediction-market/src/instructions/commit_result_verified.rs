use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::MarketError;
use crate::merkle::{verify_two_stat, ProofNode, ScoreStat};
use crate::state::{Market, MarketStatus, RootRegistry};

/// Propose the result from a TxLINE Merkle proof of the full-time goal totals.
///
/// PERMISSIONLESS: unlike `commit_result` (trusted oracle key), this needs no
/// privileged signer — the proof itself is the authorization. Anyone can pull the
/// `stat-validation` proof for both participants' goals from TxLINE and submit it;
/// the program reconstructs the published batch root and derives the outcome. A
/// dispute window still follows, and `finalize_result` settles as usual.
#[derive(Accounts)]
pub struct CommitResultVerified<'info> {
    /// Any fee payer; identity is irrelevant — the proof is what's trusted.
    pub submitter: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.match_id.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [ROOT_REGISTRY_SEED],
        bump = registry.bump,
    )]
    pub registry: Account<'info, RootRegistry>,
}

#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<CommitResultVerified>,
    home_goals: ScoreStat,
    away_goals: ScoreStat,
    home_proof: Vec<ProofNode>,
    away_proof: Vec<ProofNode>,
    sub_tree_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;

    require!(market.status == MarketStatus::Open, MarketError::MarketNotOpen);
    require!(now >= market.betting_close_ts, MarketError::BettingStillOpen);

    // The two stats must be distinct statistics from the same period (e.g. the
    // home and away full-time goal totals).
    require!(
        home_goals.key != away_goals.key && home_goals.period == away_goals.period,
        MarketError::InvalidStatPair
    );

    // Cryptographic gate: both goal totals must prove into the published root.
    require!(
        verify_two_stat(
            &home_goals,
            &away_goals,
            &home_proof,
            &away_proof,
            &sub_tree_proof,
            &main_tree_proof,
            &ctx.accounts.registry.root,
        ),
        MarketError::MerkleVerificationFailed
    );

    let outcome = if home_goals.value > away_goals.value {
        OUTCOME_HOME
    } else if home_goals.value < away_goals.value {
        OUTCOME_AWAY
    } else {
        OUTCOME_DRAW
    };

    market.proposed_outcome = outcome;
    market.result_commit_ts = now;
    market.status = MarketStatus::ResultProposed;
    market.result_verified = true;
    market.home_goals = home_goals.value;
    market.away_goals = away_goals.value;

    emit!(ResultProposedVerified {
        market: market.key(),
        outcome,
        home_goals: home_goals.value,
        away_goals: away_goals.value,
        commit_ts: now,
        dispute_window_ends: now.saturating_add(market.dispute_window),
    });
    Ok(())
}

#[event]
pub struct ResultProposedVerified {
    pub market: Pubkey,
    pub outcome: u8,
    pub home_goals: i64,
    pub away_goals: i64,
    pub commit_ts: i64,
    pub dispute_window_ends: i64,
}
