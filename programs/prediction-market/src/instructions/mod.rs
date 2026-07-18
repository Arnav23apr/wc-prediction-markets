// Each instruction module exposes a `handler`; we call them fully-qualified from
// lib.rs, so the glob re-exports (used only to surface the Accounts structs) are
// intentionally allowed to overlap on that name.
#![allow(ambiguous_glob_reexports)]

pub mod initialize_config;
pub mod initialize_market;
pub mod place_bet;
pub mod commit_result;
pub mod commit_result_verified;
pub mod commit_result_validated;
pub mod dispute_result;
pub mod resolve_dispute;
pub mod finalize_result;
pub mod claim;
pub mod init_root_registry;
pub mod set_score_root;

pub use initialize_config::*;
pub use initialize_market::*;
pub use place_bet::*;
pub use commit_result::*;
pub use commit_result_verified::*;
pub use commit_result_validated::*;
pub use dispute_result::*;
pub use resolve_dispute::*;
pub use finalize_result::*;
pub use claim::*;
pub use init_root_registry::*;
pub use set_score_root::*;
