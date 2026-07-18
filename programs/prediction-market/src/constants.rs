use anchor_lang::prelude::*;

/// PDA seeds
#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const MARKET_SEED: &[u8] = b"market";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const POSITION_SEED: &[u8] = b"position";
#[constant]
pub const ROOT_REGISTRY_SEED: &[u8] = b"root_registry";

/// A football match has three mutually exclusive full-time outcomes.
pub const NUM_OUTCOMES: usize = 3;

/// Outcome codes stored on-chain. 0/1/2 are the real outcomes; the high codes
/// are settlement-only sentinels that can never be bet on.
pub const OUTCOME_HOME: u8 = 0;
pub const OUTCOME_DRAW: u8 = 1;
pub const OUTCOME_AWAY: u8 = 2;
/// Match abandoned / postponed / cancelled -> every stake is refunded.
pub const OUTCOME_VOID: u8 = 255;
/// No result has been proposed yet.
pub const OUTCOME_NONE: u8 = 254;

/// Basis-point math.
pub const BPS_DENOMINATOR: u64 = 10_000;
/// Hard cap on the protocol fee so a market can never be created with a
/// confiscatory rake. 10%.
pub const MAX_FEE_BPS: u16 = 1_000;

/// Dispute window bounds (seconds). A zero-length window is allowed for
/// trusted/local testing; production markets should use a real window.
pub const MIN_DISPUTE_WINDOW: i64 = 0;
pub const MAX_DISPUTE_WINDOW: i64 = 7 * 24 * 60 * 60; // 7 days

/// String field caps (used by InitSpace).
pub const TEAM_NAME_MAX_LEN: usize = 48;
