//! Internal types and enums

/// The direction to round.  Used for pool token to trading token conversions to
/// avoid losing value on any deposit or withdrawal.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RoundDirection {
    /// Floor the value, ie. 1.9 => 1, 1.1 => 1, 1.5 => 1
    Floor,
    /// Ceiling the value, ie. 1.9 => 2, 1.1 => 2, 1.5 => 2
    Ceiling,
}

/// Encodes all results of swapping from a source token to a destination token
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwapResult {
    /// Amount of source token swapped
    pub source_amount_swapped: u64,
    /// Amount of destination token swapped
    pub destination_amount_swapped: u64,
}

/// Encodes results of depositing both sides at once
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TradingTokenResult {
    /// Amount of token A
    pub token_a_amount: u64,
    /// Amount of token B
    pub token_b_amount: u64,
}
