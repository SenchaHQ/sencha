//! Fees.
#![deny(missing_docs)]

use crate::*;
use ::u128::mul_div_u64;

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
        invariant!(
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
        let trade_fee = mul_div_u64(
            destination_amount_swapped,
            self.trade_fee_kbps,
            KBPS_PER_WHOLE,
        )?;

        let admin_trade_fee = mul_div_u64(trade_fee, self.admin_trade_fee_kbps, KBPS_PER_WHOLE)?;

        Some((trade_fee, admin_trade_fee))
    }

    /// Compute withdraw and admin withdraw fees from the withdrawal amount
    pub fn compute_withdraw_fees(&self, withdrawal_amount: u64) -> Option<(u64, u64)> {
        let withdraw_fee = mul_div_u64(withdrawal_amount, self.withdraw_fee_kbps, KBPS_PER_WHOLE)?;

        let admin_withdraw_fee =
            mul_div_u64(withdraw_fee, self.admin_withdraw_fee_kbps, KBPS_PER_WHOLE)?;

        Some((withdraw_fee, admin_withdraw_fee))
    }
}
