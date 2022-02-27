//! Fees.
#![deny(missing_docs)]

use anchor_lang::prelude::*;
use num_traits::ToPrimitive;

use crate::SwapFees;

/// Thousands of BPS in 100%.
pub const KBPS_PER_WHOLE: u64 = 10_000_000;

/// Initial [SwapFees] for new pools.
pub const INITIAL: SwapFees = SwapFees {
    trade_fee_kbps: 30_000,
    withdraw_fee_kbps: 0,
    admin_trade_fee_kbps: 1_600_000,
    admin_withdraw_fee_kbps: 10_000_000,
};

impl SwapFees {
    /// Validates the fees.
    pub fn validate(&self) -> Result<()> {
        require!(
            self.trade_fee_kbps <= KBPS_PER_WHOLE
                && self.withdraw_fee_kbps <= KBPS_PER_WHOLE
                && self.admin_trade_fee_kbps <= KBPS_PER_WHOLE
                && self.admin_withdraw_fee_kbps <= KBPS_PER_WHOLE,
            InvalidFee
        );
        Ok(())
    }

    /// Compute trade and admin trade fee from the trade amount
    pub fn compute_trade_fees(&self, destination_amount_swapped: u64) -> Option<(u64, u64)> {
        let trade_fee = (destination_amount_swapped as u128)
            .checked_mul(self.trade_fee_kbps.into())?
            .checked_div(KBPS_PER_WHOLE.into())?
            .to_u64()?;

        let admin_trade_fee = (trade_fee as u128)
            .checked_mul(self.admin_trade_fee_kbps.into())?
            .checked_div(KBPS_PER_WHOLE.into())?
            .to_u64()?;

        Some((trade_fee, admin_trade_fee))
    }

    /// Compute withdraw and admin withdraw fees from the withdrawal amount
    pub fn compute_withdraw_fees(&self, withdrawal_amount: u64) -> Option<(u64, u64)> {
        let withdraw_fee = (withdrawal_amount as u128)
            .checked_mul(self.withdraw_fee_kbps.into())?
            .checked_div(KBPS_PER_WHOLE.into())?
            .to_u64()?;

        let admin_withdraw_fee = (withdraw_fee as u128)
            .checked_mul(self.admin_withdraw_fee_kbps.into())?
            .checked_div(KBPS_PER_WHOLE.into())?
            .to_u64()?;

        Some((withdraw_fee, admin_withdraw_fee))
    }
}
