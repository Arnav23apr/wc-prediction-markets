#!/usr/bin/env node
/**
 * Deterministic Anchor 0.30 IDL generator for the prediction-market program.
 *
 * Why this exists: Anchor 0.30.1's `anchor idl build` runs `anchor-syn`, which
 * depends on `proc_macro2::Span::source_file()` — a method removed from current
 * proc-macro2 — and on old `syn`/`serde` that the mid-2026 crates.io graph won't
 * resolve (everything now requires edition2024). The program `.so` compiles fine
 * with modern platform-tools; only the IDL macro path is stuck. Since Anchor
 * discriminators are just sha256 prefixes and we own the program's layout, we
 * emit the IDL directly. Field order/types mirror programs/.../state.rs exactly.
 *
 * Run: node scripts/gen-idl.js
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ADDRESS = "GxkLKoL4aUqvVnUonkM9xXegjUepEaDV68EUCJJbEwtM";

const disc = (preimage) =>
  Array.from(crypto.createHash("sha256").update(preimage).digest().subarray(0, 8));
const ixDisc = (name) => disc(`global:${name}`);
const accDisc = (name) => disc(`account:${name}`);

// --- account meta helpers ---
const a = (name, { writable = false, signer = false } = {}) => ({ name, writable, signer });
const SYSTEM = { name: "system_program", address: "11111111111111111111111111111111" };
const TOKEN = { name: "token_program", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" };
const RENT = { name: "rent", address: "SysvarRent111111111111111111111111111111111" };
const TXLINE = { name: "txline_program", address: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J" };

// --- type helpers (defined here so the instruction arg list below can use them) ---
const arr = (t, n) => ({ array: [t, n] });
const defined = (name) => ({ defined: { name } });

const instructions = [
  {
    name: "initialize_config",
    accounts: [a("authority", { writable: true, signer: true }), a("config", { writable: true }), SYSTEM],
    args: [
      { name: "treasury", type: "pubkey" },
      { name: "default_fee_bps", type: "u16" },
    ],
  },
  {
    name: "initialize_market",
    accounts: [
      a("authority", { writable: true, signer: true }),
      a("market", { writable: true }),
      a("usdc_mint", {}),
      a("vault", { writable: true }),
      a("treasury", {}),
      SYSTEM,
      TOKEN,
      RENT,
    ],
    args: [
      { name: "match_id", type: "u64" },
      { name: "betting_close_ts", type: "i64" },
      { name: "dispute_window", type: "i64" },
      { name: "fee_bps", type: "u16" },
      { name: "oracle", type: "pubkey" },
      { name: "dispute_authority", type: "pubkey" },
      { name: "home_team", type: "string" },
      { name: "away_team", type: "string" },
    ],
  },
  {
    name: "place_bet",
    accounts: [
      a("bettor", { writable: true, signer: true }),
      a("market", { writable: true }),
      a("position", { writable: true }),
      a("vault", { writable: true }),
      a("bettor_token_account", { writable: true }),
      TOKEN,
      SYSTEM,
    ],
    args: [
      { name: "outcome", type: "u8" },
      { name: "amount", type: "u64" },
    ],
  },
  {
    name: "commit_result",
    accounts: [a("market", { writable: true }), a("oracle", { signer: true })],
    args: [{ name: "outcome", type: "u8" }],
  },
  {
    name: "init_root_registry",
    accounts: [a("payer", { writable: true, signer: true }), a("registry", { writable: true }), SYSTEM],
    args: [{ name: "authority", type: "pubkey" }],
  },
  {
    name: "set_score_root",
    accounts: [a("registry", { writable: true }), a("authority", { signer: true })],
    args: [{ name: "root", type: arr("u8", 32) }],
  },
  {
    name: "commit_result_verified",
    accounts: [a("submitter", { signer: true }), a("market", { writable: true }), a("registry", {})],
    args: [
      { name: "home_goals", type: defined("ScoreStat") },
      { name: "away_goals", type: defined("ScoreStat") },
      { name: "home_proof", type: { vec: defined("ProofNode") } },
      { name: "away_proof", type: { vec: defined("ProofNode") } },
      { name: "sub_tree_proof", type: { vec: defined("ProofNode") } },
      { name: "main_tree_proof", type: { vec: defined("ProofNode") } },
    ],
  },
  {
    name: "commit_result_validated",
    accounts: [
      a("submitter", { signer: true }),
      a("market", { writable: true }),
      a("daily_scores_roots", {}),
      TXLINE,
    ],
    args: [
      { name: "proposed_outcome", type: "u8" },
      { name: "ts", type: "i64" },
      { name: "fixture_summary", type: defined("ScoresBatchSummary") },
      { name: "fixture_proof", type: { vec: defined("TxProofNode") } },
      { name: "main_tree_proof", type: { vec: defined("TxProofNode") } },
      { name: "stat_home", type: defined("StatTerm") },
      { name: "stat_away", type: defined("StatTerm") },
    ],
  },
  {
    name: "dispute_result",
    accounts: [a("market", { writable: true }), a("dispute_authority", { signer: true })],
    args: [],
  },
  {
    name: "resolve_dispute",
    accounts: [
      a("market", { writable: true }),
      a("authority", { signer: true }),
      a("vault", { writable: true }),
      a("treasury", { writable: true }),
      TOKEN,
    ],
    args: [{ name: "final_outcome", type: "u8" }],
  },
  {
    name: "finalize_result",
    accounts: [
      a("market", { writable: true }),
      a("vault", { writable: true }),
      a("treasury", { writable: true }),
      TOKEN,
    ],
    args: [],
  },
  {
    name: "claim",
    accounts: [
      a("claimant", { writable: true, signer: true }),
      a("market", { writable: true }),
      a("position", { writable: true }),
      a("vault", { writable: true }),
      a("claimant_token_account", { writable: true }),
      TOKEN,
    ],
    args: [],
  },
];

// --- type layouts (mirror state.rs field order EXACTLY) ---
const types = [
  {
    name: "MarketStatus",
    type: {
      kind: "enum",
      variants: [
        { name: "Open" },
        { name: "ResultProposed" },
        { name: "Disputed" },
        { name: "Settled" },
        { name: "Voided" },
      ],
    },
  },
  {
    name: "Config",
    type: {
      kind: "struct",
      fields: [
        { name: "authority", type: "pubkey" },
        { name: "treasury", type: "pubkey" },
        { name: "default_fee_bps", type: "u16" },
        { name: "markets_created", type: "u64" },
        { name: "bump", type: "u8" },
      ],
    },
  },
  {
    name: "Market",
    type: {
      kind: "struct",
      fields: [
        { name: "match_id", type: "u64" },
        { name: "authority", type: "pubkey" },
        { name: "oracle", type: "pubkey" },
        { name: "dispute_authority", type: "pubkey" },
        { name: "usdc_mint", type: "pubkey" },
        { name: "vault", type: "pubkey" },
        { name: "treasury", type: "pubkey" },
        { name: "betting_close_ts", type: "i64" },
        { name: "dispute_window", type: "i64" },
        { name: "result_commit_ts", type: "i64" },
        { name: "pools", type: arr("u64", 3) },
        { name: "total_pool", type: "u64" },
        { name: "payout_pool", type: "u64" },
        { name: "winning_pool", type: "u64" },
        { name: "fee_collected", type: "u64" },
        { name: "claimed_amount", type: "u64" },
        { name: "num_bettors", type: "u32" },
        { name: "fee_bps", type: "u16" },
        { name: "status", type: defined("MarketStatus") },
        { name: "proposed_outcome", type: "u8" },
        { name: "final_outcome", type: "u8" },
        { name: "bump", type: "u8" },
        { name: "vault_bump", type: "u8" },
        { name: "home_team", type: "string" },
        { name: "away_team", type: "string" },
        { name: "result_verified", type: "bool" },
        { name: "home_goals", type: "i64" },
        { name: "away_goals", type: "i64" },
      ],
    },
  },
  {
    name: "RootRegistry",
    type: {
      kind: "struct",
      fields: [
        { name: "authority", type: "pubkey" },
        { name: "root", type: arr("u8", 32) },
        { name: "updated_at", type: "i64" },
        { name: "bump", type: "u8" },
      ],
    },
  },
  {
    name: "ScoreStat",
    type: {
      kind: "struct",
      fields: [
        { name: "key", type: "i64" },
        { name: "value", type: "i64" },
        { name: "period", type: "i64" },
      ],
    },
  },
  {
    name: "ProofNode",
    type: {
      kind: "struct",
      fields: [
        { name: "hash", type: arr("u8", 32) },
        { name: "is_right_sibling", type: "bool" },
      ],
    },
  },
  {
    name: "Position",
    type: {
      kind: "struct",
      fields: [
        { name: "market", type: "pubkey" },
        { name: "owner", type: "pubkey" },
        { name: "stakes", type: arr("u64", 3) },
        { name: "total_stake", type: "u64" },
        { name: "claimed", type: "bool" },
        { name: "bump", type: "u8" },
      ],
    },
  },
  // --- TxLINE validate_stat CPI arg types (mirror txline_cpi.rs) ---
  {
    name: "TxProofNode",
    type: {
      kind: "struct",
      fields: [
        { name: "hash", type: arr("u8", 32) },
        { name: "is_right_sibling", type: "bool" },
      ],
    },
  },
  {
    name: "TxScoreStat",
    type: {
      kind: "struct",
      fields: [
        { name: "key", type: "u32" },
        { name: "value", type: "i32" },
        { name: "period", type: "i32" },
      ],
    },
  },
  {
    name: "StatTerm",
    type: {
      kind: "struct",
      fields: [
        { name: "stat_to_prove", type: defined("TxScoreStat") },
        { name: "event_stat_root", type: arr("u8", 32) },
        { name: "stat_proof", type: { vec: defined("TxProofNode") } },
      ],
    },
  },
  {
    name: "ScoresUpdateStats",
    type: {
      kind: "struct",
      fields: [
        { name: "update_count", type: "i32" },
        { name: "min_timestamp", type: "i64" },
        { name: "max_timestamp", type: "i64" },
      ],
    },
  },
  {
    name: "ScoresBatchSummary",
    type: {
      kind: "struct",
      fields: [
        { name: "fixture_id", type: "i64" },
        { name: "update_stats", type: defined("ScoresUpdateStats") },
        { name: "events_sub_tree_root", type: arr("u8", 32) },
      ],
    },
  },
];

const accounts = [
  { name: "Config", discriminator: accDisc("Config") },
  { name: "Market", discriminator: accDisc("Market") },
  { name: "Position", discriminator: accDisc("Position") },
  { name: "RootRegistry", discriminator: accDisc("RootRegistry") },
];

// --- errors (mirror errors.rs order; Anchor numbers from 6000) ---
const errorNames = [
  ["FeeTooHigh", "Fee exceeds the maximum allowed basis points"],
  ["InvalidDisputeWindow", "Dispute window is outside the allowed range"],
  ["InvalidBettingClose", "Betting close timestamp must be in the future"],
  ["InvalidOutcome", "Outcome index is not a valid bettable outcome"],
  ["InvalidResolution", "Proposed result is not a valid settlement outcome"],
  ["ZeroAmount", "Bet amount must be greater than zero"],
  ["BettingClosed", "Betting is closed for this market"],
  ["MarketNotOpen", "Market is not accepting bets in its current status"],
  ["BettingStillOpen", "A result cannot be proposed until betting has closed"],
  ["NotAwaitingResult", "Market is not awaiting a proposed result"],
  ["NoProposedResult", "Market does not have a proposed result to dispute"],
  ["DisputeWindowClosed", "The dispute window has already closed"],
  ["DisputeWindowOpen", "The dispute window is still open; result cannot be finalized yet"],
  ["NotDisputed", "Market is not in a disputed state"],
  ["NotSettled", "Market has not been settled or voided yet"],
  ["AlreadyClaimed", "Position has already been claimed"],
  ["NothingToClaim", "There is nothing to claim for this position"],
  ["NotPositionOwner", "Signer is not the owner of this position"],
  ["TokenAccountMismatch", "Provided token account does not match the expected account"],
  ["MathOverflow", "Arithmetic overflow"],
  ["MerkleVerificationFailed", "Merkle proof did not reconstruct to the published score root"],
  ["InvalidStatPair", "The two proven stats must differ and share the same period"],
  ["NotRootAuthority", "Signer is not the score-root authority"],
  ["TxlineRootMismatch", "Provided roots account is not TxLINE's daily-roots PDA for this proof"],
  ["TxlineValidationFailed", "TxLINE validate_stat did not confirm the proposed outcome"],
];
const errors = errorNames.map(([name, msg], i) => ({ code: 6000 + i, name, msg }));

const idl = {
  address: ADDRESS,
  metadata: {
    name: "prediction_market",
    version: "0.1.0",
    spec: "0.1.0",
    description: "World Cup parimutuel prediction markets with commit-dispute-finalize settlement",
  },
  instructions: instructions
    .map((ix) => ({ name: ix.name, discriminator: ixDisc(ix.name), accounts: ix.accounts, args: ix.args }))
    // Anchor sorts instructions alphabetically; not required, but keeps diffs stable.
    .sort((x, y) => x.name.localeCompare(y.name)),
  accounts,
  errors,
  types,
};

const outDir = path.resolve(__dirname, "../target/idl");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "prediction_market.json");
fs.writeFileSync(outPath, JSON.stringify(idl, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`  ${idl.instructions.length} instructions, ${accounts.length} accounts, ${errors.length} errors`);
