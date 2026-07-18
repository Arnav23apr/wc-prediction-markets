//! Manual CPI into TxLINE's on-chain oracle `validate_stat` instruction.
//!
//! This is the *fully trustless* settlement primitive: instead of mirroring a
//! score root ourselves (`set_score_root`), we ask TxLINE's own program to verify
//! a Merkle proof of the goal totals against its daily anchored root account
//! (`daily_scores_merkle_roots`) and read back the boolean result. So the trust
//! anchor is TxLINE's Solana-anchored data, not a relayer we run.
//!
//! Interface transcribed from
//!   https://txline.txodds.com/documentation/programs/devnet
//!   https://txline.txodds.com/documentation/examples/onchain-validation
//! (arg order, struct layouts, and the `Comparison`/`BinaryExpression` enums).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::{get_return_data, invoke},
};

/// TxLINE oracle program (devnet) `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`.
/// Mainnet: 9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA
pub const TXLINE_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    86, 117, 159, 44, 144, 95, 120, 96, 200, 99, 119, 20, 191, 36, 145, 48, 157, 192, 113, 129,
    81, 63, 122, 36, 191, 62, 218, 248, 127, 119, 80, 3,
]);

/// Anchor discriminator for `validate_stat` = sha256("global:validate_stat")[..8].
pub const VALIDATE_STAT_DISC: [u8; 8] = [0x6b, 0xc5, 0xe8, 0x5a, 0xbf, 0x88, 0x69, 0xb9];

/// Seed for TxLINE's daily anchored root PDA (`["daily_scores_roots", epochDay_le_u16]`).
pub const DAILY_ROOTS_SEED: &[u8] = b"daily_scores_roots";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TxProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct TxScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StatTerm {
    pub stat_to_prove: TxScoreStat,
    pub event_stat_root: [u8; 32],
    pub stat_proof: Vec<TxProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

#[derive(AnchorSerialize)]
struct ValidateStatArgs {
    ts: i64,
    fixture_summary: ScoresBatchSummary,
    fixture_proof: Vec<TxProofNode>,
    main_tree_proof: Vec<TxProofNode>,
    predicate: TraderPredicate,
    stat_a: StatTerm,
    stat_b: Option<StatTerm>,
    op: Option<BinaryExpression>,
}

/// The daily-roots PDA that anchors TxLINE's batch root for `epoch_day`
/// (days since the unix epoch).
pub fn daily_roots_pda(epoch_day: u16) -> Pubkey {
    Pubkey::find_program_address(&[DAILY_ROOTS_SEED, &epoch_day.to_le_bytes()], &TXLINE_PROGRAM_ID).0
}

/// CPI `validate_stat` and return its boolean result. `daily_roots` must be the
/// TxLINE-owned root account for the proof's day (caller verifies the PDA).
#[allow(clippy::too_many_arguments)]
pub fn validate_stat<'info>(
    txline_program: AccountInfo<'info>,
    daily_roots: AccountInfo<'info>,
    ts: i64,
    fixture_summary: ScoresBatchSummary,
    fixture_proof: Vec<TxProofNode>,
    main_tree_proof: Vec<TxProofNode>,
    predicate: TraderPredicate,
    stat_a: StatTerm,
    stat_b: Option<StatTerm>,
    op: Option<BinaryExpression>,
) -> Result<bool> {
    let args = ValidateStatArgs {
        ts,
        fixture_summary,
        fixture_proof,
        main_tree_proof,
        predicate,
        stat_a,
        stat_b,
        op,
    };
    let mut data = VALIDATE_STAT_DISC.to_vec();
    args.serialize(&mut data)?;

    let ix = Instruction {
        program_id: TXLINE_PROGRAM_ID,
        accounts: vec![AccountMeta::new_readonly(*daily_roots.key, false)],
        data,
    };
    invoke(&ix, &[daily_roots, txline_program])?;

    // validate_stat returns `bool` via Anchor return data (Borsh: 1 byte).
    match get_return_data() {
        Some((pid, bytes)) if pid == TXLINE_PROGRAM_ID => Ok(bytes.first().copied().unwrap_or(0) == 1),
        _ => Ok(false),
    }
}
