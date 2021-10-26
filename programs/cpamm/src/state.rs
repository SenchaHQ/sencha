//! Swap state.
#![deny(missing_docs)]

use anchor_lang::prelude::*;

use crate::InitSwapToken;

/// Keeps track of [SwapInfo]s.
#[account]
#[derive(Copy, Debug, Default, PartialEq, Eq)]
pub struct Factory {
    /// Base of the [Factory].
    pub base: Pubkey,
    /// The bump seed.
    pub bump: u8,
    /// Total number of swaps that have been created.
    pub num_swaps: u64,
    /// Admin of the [Factory]. Currently unused.
    pub admin: Pubkey,
    /// Reserved for future program upgrades.
    pub reserved: [u64; 16],
}

/// A swap with an index. Used by the [Factory].
#[account]
#[derive(Copy, Debug, Default, PartialEq, Eq)]
pub struct SwapMeta {
    /// The [Factory].
    pub factory: Pubkey,
    /// Index of the [SwapInfo].
    pub index: u64,
    /// The bump seed.
    pub bump: u8,
    /// The [SwapInfo] address.
    pub swap: Pubkey,
    /// When the swap was created.
    pub created_at: i64,
    /// Who created the [SwapInfo].
    pub created_by: Pubkey,
}

/// Stores information about a swap.
#[account]
#[derive(Copy, Debug, Default, PartialEq, Eq)]
pub struct SwapInfo {
    /// The [Factory].
    pub factory: Pubkey,
    /// The bump seed.
    pub bump: u8,

    /// Index
    pub index: u64,
    /// Public key of admin account to execute admin instructions.
    /// This is immutable.
    pub admin_key: Pubkey,
    /// Token 0
    pub token_0: SwapTokenInfo,
    /// Token 1
    pub token_1: SwapTokenInfo,

    /// Paused state
    pub is_paused: bool,
    /// Pool tokens are issued when A or B tokens are deposited.
    /// Pool tokens can be withdrawn back to the original A or B token.
    pub pool_mint: Pubkey,
    /// Fees
    pub fees: SwapFees,

    /// Cumulative statistics about the swap.
    pub cumulative_stats: SwapCumulativeStats,
    /// Price information.
    /// For more information, view [crate::price_info].
    pub price_info: SwapPriceInfo,

    /// Data reserved for future program upgrades.
    pub reserved: [u64; 16],
}

/// Cumulative statistics about the swap.
/// This can be combined with recurring snapshot jobs that will store this variable periodically,
/// giving us stuff like 24h, 7d, etc. volume, deposits, withdraws, fees.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SwapCumulativeStats {
    /// Stats for token 0.
    pub token_0: SwapCumulativeTokenStats,
    /// Stats for token 1.
    pub token_1: SwapCumulativeTokenStats,

    /// Total number of LP tokens ever minted.
    pub total_lp_minted: u128,
    /// Total number of LP tokens ever redeemed for the underlying tokens.
    /// This can be combined with total minted + snapshotting to retrieve historical
    /// deposit/withdraw volume on-chain.
    pub total_lp_redeemed: u128,
}

/// Cumulative statistics on swaps.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SwapCumulativeTokenStats {
    /// Total input volume the swap has ever done for this token.
    pub total_input_volume: u128,
    /// Total output volume the swap has ever done for this token.
    pub total_output_volume: u128,
    /// Total deposits ever done into this swap for this token.
    pub total_deposit_volume: u128,
    /// Total withdraws ever done into this swap for this token.
    pub total_withdraw_volume: u128,
    /// Total trade fees collected for this token.
    /// This includes both the LP fee and the admin fees.
    pub total_trade_fees: u64,
}

/// Price information about a [SwapInfo].
/// Usage: <https://uniswap.org/docs/v2/core-concepts/oracles/>
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SwapPriceInfo {
    /// Last time the state was updated
    pub last_update_ts: i64,
    /// Last cumulative price of token 0
    pub price_0_cumulative_last: u128,
    /// Last cumulative price of token 1
    pub price_1_cumulative_last: u128,
}

/// Information about one of the tokens.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SwapTokenInfo {
    /// Token account for pool reserves
    pub reserves: Pubkey,
    /// Mint information for the token
    pub mint: Pubkey,
    /// Public key of the admin token account to receive trading and / or withdrawal fees for token
    pub admin_fees: Pubkey,
}

impl<'info> From<&InitSwapToken<'info>> for SwapTokenInfo {
    fn from(token_info: &InitSwapToken) -> Self {
        Self {
            reserves: token_info.reserve.key(),
            mint: token_info.mint.key(),
            admin_fees: token_info.fees.key(),
        }
    }
}

/// Fees associated with a [SwapInfo].
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SwapFees {
    /// Trade fee, thousands of bps
    pub trade_fee_kbps: u64,
    /// Withdraw fee, thousands of bps
    pub withdraw_fee_kbps: u64,
    /// Proportion of trade fee sent to the admin, thousands of bps
    pub admin_trade_fee_kbps: u64,
    /// Proportion of withdraw fee sent to the admin, thousands of bps
    pub admin_withdraw_fee_kbps: u64,
}
