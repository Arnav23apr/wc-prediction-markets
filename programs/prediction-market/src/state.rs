use anchor_lang::prelude::*;

use crate::constants::{NUM_OUTCOMES, TEAM_NAME_MAX_LEN};

/// Lifecycle of a single match market.
///
/// ```text
///   Open ──(commit_result)──> ResultProposed ──(finalize)──> Settled | Voided
///                                   │
///                              (dispute_result)
///                                   ▼
///                               Disputed ──(resolve_dispute)──> Settled | Voided
/// ```
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MarketStatus {
    /// Accepting bets until `betting_close_ts`.
    Open,
    /// Oracle has proposed a result; the dispute window is counting down.
    ResultProposed,
    /// A challenge was raised; frozen until an admin resolves it.
    Disputed,
    /// Final result locked in; winners may claim pro-rata.
    Settled,
    /// Match voided (abandoned, or no winning stake); everyone is refunded.
    Voided,
}

/// Optional global config. Markets are self-contained, so this is informational
/// / convenience state (default fee, a registry counter) and is not required on
/// the hot path.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub default_fee_bps: u16,
    pub markets_created: u64,
    pub bump: u8,
}

/// One market == one football match.
#[account]
#[derive(InitSpace)]
pub struct Market {
    /// TxODDS fixture id; also the PDA seed so a match maps to exactly one market.
    pub match_id: u64,

    /// Admin that created the market and can resolve disputes.
    pub authority: Pubkey,
    /// Key authorised to propose the result (the TxODDS relayer's signer).
    pub oracle: Pubkey,
    /// Key authorised to challenge a proposed result during the dispute window.
    pub dispute_authority: Pubkey,

    pub usdc_mint: Pubkey,
    /// Program-owned escrow token account holding all stakes.
    pub vault: Pubkey,
    /// Token account that receives the protocol fee at settlement.
    pub treasury: Pubkey,

    /// Bets accepted strictly before this unix timestamp (kickoff).
    pub betting_close_ts: i64,
    /// Seconds a proposed result can be challenged before it can be finalized.
    pub dispute_window: i64,
    /// When the current result was proposed (0 if none).
    pub result_commit_ts: i64,

    /// Total staked on each outcome, indexed by outcome code 0/1/2.
    pub pools: [u64; NUM_OUTCOMES],
    /// Sum of `pools`.
    pub total_pool: u64,

    /// Snapshot taken at settlement: amount distributable to winners
    /// (`total_pool - fee`). Refunds (void) use `total_pool` directly.
    pub payout_pool: u64,
    /// Snapshot taken at settlement: total stake on the winning outcome.
    /// Claims are `stake_on_winner * payout_pool / winning_pool`.
    pub winning_pool: u64,
    /// Fee skimmed to treasury at settlement.
    pub fee_collected: u64,
    /// Running total paid out (accounting / sanity).
    pub claimed_amount: u64,

    pub num_bettors: u32,
    pub fee_bps: u16,
    pub status: MarketStatus,

    /// Oracle's proposed outcome code (OUTCOME_*), valid while ResultProposed/Disputed.
    pub proposed_outcome: u8,
    /// The locked outcome code after settlement.
    pub final_outcome: u8,

    pub bump: u8,
    pub vault_bump: u8,

    #[max_len(TEAM_NAME_MAX_LEN)]
    pub home_team: String,
    #[max_len(TEAM_NAME_MAX_LEN)]
    pub away_team: String,

    /// True when the proposed result was set via a verified TxLINE Merkle proof
    /// (`commit_result_verified`) rather than a trusted oracle signature.
    pub result_verified: bool,
    /// Proven full-time goals (only meaningful when `result_verified`), surfaced
    /// in the UI's proof view. Both 0 for trusted/unsettled markets.
    pub home_goals: i64,
    pub away_goals: i64,
}

/// Singleton registry holding the latest TxLINE batch Merkle root that verified
/// settlements are checked against. In production the `authority` is TxLINE's
/// root publisher (or a relayer mirroring their on-chain root).
#[account]
#[derive(InitSpace)]
pub struct RootRegistry {
    pub authority: Pubkey,
    pub root: [u8; 32],
    pub updated_at: i64,
    pub bump: u8,
}

/// Per-(market, user) ledger of stake across outcomes.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub market: Pubkey,
    pub owner: Pubkey,
    /// Stake on each outcome, indexed by outcome code 0/1/2.
    pub stakes: [u64; NUM_OUTCOMES],
    /// Sum of `stakes` (refund amount on void).
    pub total_stake: u64,
    pub claimed: bool,
    pub bump: u8,
}
