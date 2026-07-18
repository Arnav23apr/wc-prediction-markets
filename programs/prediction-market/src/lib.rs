//! World Cup Prediction Markets — parimutuel pools with a commit → dispute →
//! finalize settlement pipeline, designed to be driven by the TxODDS football feed.
//!
//! Design notes live in /README.md. The short version:
//! - Bets pool into three outcomes (Home/Draw/Away); winners split the pool pro-rata.
//! - Settlement is deliberately multi-step so a single oracle key can never both
//!   propose AND irreversibly pay out in one action.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod merkle;
pub mod settlement;
pub mod state;
pub mod txline_cpi;

use instructions::*;
use merkle::{ProofNode, ScoreStat};
use txline_cpi::{ScoresBatchSummary, StatTerm, TxProofNode};

declare_id!("GxkLKoL4aUqvVnUonkM9xXegjUepEaDV68EUCJJbEwtM");

#[program]
pub mod prediction_market {
    use super::*;

    /// One-time global config (optional convenience state).
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        treasury: Pubkey,
        default_fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize_config::handler(ctx, treasury, default_fee_bps)
    }

    /// Create a market for one match.
    #[allow(clippy::too_many_arguments)]
    pub fn initialize_market(
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
        instructions::initialize_market::handler(
            ctx,
            match_id,
            betting_close_ts,
            dispute_window,
            fee_bps,
            oracle,
            dispute_authority,
            home_team,
            away_team,
        )
    }

    /// Stake USDC on an outcome (0=Home, 1=Draw, 2=Away) before kickoff.
    pub fn place_bet(ctx: Context<PlaceBet>, outcome: u8, amount: u64) -> Result<()> {
        instructions::place_bet::handler(ctx, outcome, amount)
    }

    /// Oracle proposes the full-time result; starts the dispute window.
    pub fn commit_result(ctx: Context<CommitResult>, outcome: u8) -> Result<()> {
        instructions::commit_result::handler(ctx, outcome)
    }

    /// One-time init of the TxLINE score-root registry.
    pub fn init_root_registry(ctx: Context<InitRootRegistry>, authority: Pubkey) -> Result<()> {
        instructions::init_root_registry::handler(ctx, authority)
    }

    /// Root authority publishes the latest TxLINE batch Merkle root.
    pub fn set_score_root(ctx: Context<SetScoreRoot>, root: [u8; 32]) -> Result<()> {
        instructions::set_score_root::handler(ctx, root)
    }

    /// Permissionless: propose the result from a verified TxLINE Merkle proof of
    /// the home/away goal totals (no trusted oracle key required).
    #[allow(clippy::too_many_arguments)]
    pub fn commit_result_verified(
        ctx: Context<CommitResultVerified>,
        home_goals: ScoreStat,
        away_goals: ScoreStat,
        home_proof: Vec<ProofNode>,
        away_proof: Vec<ProofNode>,
        sub_tree_proof: Vec<ProofNode>,
        main_tree_proof: Vec<ProofNode>,
    ) -> Result<()> {
        instructions::commit_result_verified::handler(
            ctx, home_goals, away_goals, home_proof, away_proof, sub_tree_proof, main_tree_proof,
        )
    }

    /// Fully trustless: propose the result via a CPI into TxLINE's own
    /// `validate_stat`, checking the home/away goals against TxLINE's anchored
    /// daily root. No mirrored root, no oracle key.
    #[allow(clippy::too_many_arguments)]
    pub fn commit_result_validated(
        ctx: Context<CommitResultValidated>,
        proposed_outcome: u8,
        ts: i64,
        fixture_summary: ScoresBatchSummary,
        fixture_proof: Vec<TxProofNode>,
        main_tree_proof: Vec<TxProofNode>,
        stat_home: StatTerm,
        stat_away: StatTerm,
    ) -> Result<()> {
        instructions::commit_result_validated::handler(
            ctx, proposed_outcome, ts, fixture_summary, fixture_proof, main_tree_proof, stat_home, stat_away,
        )
    }

    /// Dispute authority freezes a proposed result during the window.
    pub fn dispute_result(ctx: Context<DisputeResult>) -> Result<()> {
        instructions::dispute_result::handler(ctx)
    }

    /// Admin settles a disputed market with the authoritative outcome.
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, final_outcome: u8) -> Result<()> {
        instructions::resolve_dispute::handler(ctx, final_outcome)
    }

    /// Permissionless finalize after the dispute window elapses.
    pub fn finalize_result(ctx: Context<FinalizeResult>) -> Result<()> {
        instructions::finalize_result::handler(ctx)
    }

    /// Claim winnings (settled) or refund (voided).
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }
}
