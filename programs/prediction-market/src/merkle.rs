//! Three-stage Merkle verification for TxLINE score proofs.
//!
//! TxLINE (`GET /api/scores/stat-validation`) returns a proof that a single score
//! statistic is committed in a published batch root, via a three-level hierarchy:
//!   1. stat   -> event stat root   (`statProof`)
//!   2. event  -> sub-tree root     (`subTreeProof`)
//!   3. sub    -> batch root        (`mainTreeProof`)
//! Each proof element is `{ hash, isRightSibling }`. With the `statKey2` variant
//! the response also proves a second stat (`statProof2`) sharing the same event —
//! we use that to prove BOTH the home and away goal totals against one root, then
//! derive the match outcome trustlessly.
//!
//! Determinism: every function here is pure — no clock, no randomness, no account
//! reads. The same (stat, proof, root) inputs always yield the same boolean, so
//! validation is fully reproducible and independently auditable off-chain.
//!
//! Two details are not pinned down in TxLINE's public docs and are isolated here
//! so they can be matched to live data without touching the settlement logic:
//!   - hash function: we use SHA-256 (Solana's native `hashv` syscall).
//!   - leaf encoding: domain-separated LE encoding of (key, value, period).
//! `scripts/gen-idl.js` + the tests build trees with the identical scheme, so the
//! verifier is exercised end-to-end; swap these two constants/functions to align
//! with TxLINE's exact serialization once confirmed.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

/// Domain separators (prevent leaf/!node second-preimage ambiguity).
pub const LEAF_PREFIX: u8 = 0x00;
pub const NODE_PREFIX: u8 = 0x01;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProofNode {
    pub hash: [u8; 32],
    /// True if this sibling sits to the RIGHT of the running hash.
    pub is_right_sibling: bool,
}

/// One score statistic, mirroring TxLINE's `statToProve { key, value, period }`.
/// `key` identifies which statistic (e.g. a participant's goal total), `value` is
/// the count, `period` the match period (full-time, etc.).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct ScoreStat {
    pub key: i64,
    pub value: i64,
    pub period: i64,
}

pub fn leaf_hash(stat: &ScoreStat) -> [u8; 32] {
    hashv(&[
        &[LEAF_PREFIX],
        &stat.key.to_le_bytes(),
        &stat.value.to_le_bytes(),
        &stat.period.to_le_bytes(),
    ])
    .to_bytes()
}

fn node_hash(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    hashv(&[&[NODE_PREFIX], left, right]).to_bytes()
}

/// Fold a leaf up through its sibling path to the (sub)root.
pub fn fold(leaf: [u8; 32], proof: &[ProofNode]) -> [u8; 32] {
    let mut acc = leaf;
    for node in proof {
        acc = if node.is_right_sibling {
            node_hash(&acc, &node.hash) // running hash on the left
        } else {
            node_hash(&node.hash, &acc) // running hash on the right
        };
    }
    acc
}

/// Verify two stats from the SAME score event reconstruct to `root` via the
/// three-stage hierarchy. Returns true iff the proofs are internally consistent
/// (both reach the same event stat root) and reach the published batch `root`.
#[allow(clippy::too_many_arguments)]
pub fn verify_two_stat(
    stat_a: &ScoreStat,
    stat_b: &ScoreStat,
    proof_a: &[ProofNode],
    proof_b: &[ProofNode],
    sub_tree_proof: &[ProofNode],
    main_tree_proof: &[ProofNode],
    root: &[u8; 32],
) -> bool {
    // Stage 1 — both stats must fold to the SAME event stat root.
    let event_root_a = fold(leaf_hash(stat_a), proof_a);
    let event_root_b = fold(leaf_hash(stat_b), proof_b);
    if event_root_a != event_root_b {
        return false;
    }
    // Stage 2 — event stat root -> event-stats sub-tree root.
    let sub_root = fold(event_root_a, sub_tree_proof);
    // Stage 3 — sub-tree root -> batch root.
    let batch_root = fold(sub_root, main_tree_proof);
    &batch_root == root
}
