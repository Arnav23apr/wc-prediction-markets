use anchor_lang::prelude::*;

#[error_code]
pub enum MarketError {
    #[msg("Fee exceeds the maximum allowed basis points")]
    FeeTooHigh,
    #[msg("Dispute window is outside the allowed range")]
    InvalidDisputeWindow,
    #[msg("Betting close timestamp must be in the future")]
    InvalidBettingClose,
    #[msg("Outcome index is not a valid bettable outcome")]
    InvalidOutcome,
    #[msg("Proposed result is not a valid settlement outcome")]
    InvalidResolution,
    #[msg("Bet amount must be greater than zero")]
    ZeroAmount,
    #[msg("Betting is closed for this market")]
    BettingClosed,
    #[msg("Market is not accepting bets in its current status")]
    MarketNotOpen,
    #[msg("A result cannot be proposed until betting has closed")]
    BettingStillOpen,
    #[msg("Market is not awaiting a proposed result")]
    NotAwaitingResult,
    #[msg("Market does not have a proposed result to dispute")]
    NoProposedResult,
    #[msg("The dispute window has already closed")]
    DisputeWindowClosed,
    #[msg("The dispute window is still open; result cannot be finalized yet")]
    DisputeWindowOpen,
    #[msg("Market is not in a disputed state")]
    NotDisputed,
    #[msg("Market has not been settled or voided yet")]
    NotSettled,
    #[msg("Position has already been claimed")]
    AlreadyClaimed,
    #[msg("There is nothing to claim for this position")]
    NothingToClaim,
    #[msg("Signer is not the owner of this position")]
    NotPositionOwner,
    #[msg("Provided token account does not match the expected account")]
    TokenAccountMismatch,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Merkle proof did not reconstruct to the published score root")]
    MerkleVerificationFailed,
    #[msg("The two proven stats must differ and share the same period")]
    InvalidStatPair,
    #[msg("Signer is not the score-root authority")]
    NotRootAuthority,
    #[msg("Provided roots account is not TxLINE's daily-roots PDA for this proof")]
    TxlineRootMismatch,
    #[msg("TxLINE validate_stat did not confirm the proposed outcome")]
    TxlineValidationFailed,
}
