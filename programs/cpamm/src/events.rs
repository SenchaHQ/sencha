//! Events emitted by the program.
#![deny(missing_docs)]

use anchor_lang::prelude::*;

/// Emitted on a successful [crate::cpamm::new_swap].
#[event]
pub struct NewPoolEvent {
    /// Mint of the LP token.
    #[index]
    pub lp_mint: Pubkey,
    /// Mint of token 0.
    pub mint_0: Pubkey,
    /// Mint of token 1.
    pub mint_1: Pubkey,
    /// Initial number of LP tokens in the pool.
    pub initial_liquidity: u64,
}

/// Emitted on a successful [crate::cpamm::deposit].
#[event]
pub struct DepositEvent {
    /// Mint of the LP token.
    #[index]
    pub lp_mint: Pubkey,
    /// Amount of pool tokens created.
    pub pool_token_amount: u64,
    /// Amount of token 0 deposited.
    pub token_0_amount: u64,
    /// Amount of token 1 deposited.
    pub token_1_amount: u64,
}

/// Emitted on a successful [crate::cpamm::withdraw].
#[event]
pub struct WithdrawEvent {
    /// Mint of the LP token.
    #[index]
    pub lp_mint: Pubkey,
    /// Amount of pool tokens burned.
    pub pool_token_amount: u64,
    /// Amount of token 0 withdrawn.
    pub token_0_amount: u64,
    /// Amount of token 1 withdrawn.
    pub token_1_amount: u64,
}

/// Emitted on a successful [crate::cpamm::swap].
#[event]
pub struct SwapEvent {
    /// Mint of the LP token.
    #[index]
    pub lp_mint: Pubkey,
    /// Mint of the input (source) token.
    pub input_mint: Pubkey,
    /// Mint of the output (destination) token.
    pub output_mint: Pubkey,
    /// Amount of source token swapped
    pub source_amount_swapped: u64,
    /// Amount of destination token swapped
    pub destination_amount_swapped: u64,
}
