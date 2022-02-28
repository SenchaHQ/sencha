//! Swap historical price information.
//! This is based on the Uniswap V2 TWAP oracle solution.
#![deny(missing_docs)]

use anchor_lang::prelude::*;
use num_traits::ToPrimitive;
use vipers::unwrap_int;

use crate::SwapPriceInfo;

/// Scale of a price.
pub const PRICE_SCALE: u8 = 18;

fn to_precise(num: u64) -> Option<u128> {
    (num as u128).checked_mul(10u128.pow(PRICE_SCALE.into()))
}

fn add_cumulative_price_info(
    other_reserve: u64,
    this_reserve: u64,
    time_elapsed: u64,
) -> Option<u128> {
    to_precise(other_reserve)?
        .checked_div(this_reserve.into())?
        .checked_mul(time_elapsed.into())
}

impl SwapPriceInfo {
    /// Updates the cumulative price information.
    /// This should be called before the pool is mutated.
    /// Taken from <https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol>.
    pub fn update_cumulative_price_info(&mut self, reserve_0: u64, reserve_1: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        if self.last_update_ts > now || reserve_0 == 0 || reserve_1 == 0 {
            return Ok(());
        }

        let time_elapsed: u64 = unwrap_int!(now
            .checked_sub(self.last_update_ts)
            .and_then(|v| v.to_u64()));

        // * never overflows, and + overflow is desired
        let price_0_add: u128 = unwrap_int!(add_cumulative_price_info(
            reserve_1,
            reserve_0,
            time_elapsed
        ));
        let price_1_add: u128 = unwrap_int!(add_cumulative_price_info(
            reserve_0,
            reserve_1,
            time_elapsed
        ));

        let (next_price_0_cumulative, _) =
            self.price_0_cumulative_last.overflowing_add(price_0_add);
        self.price_0_cumulative_last = next_price_0_cumulative;

        let (next_price_1_cumulative, _) =
            self.price_1_cumulative_last.overflowing_add(price_1_add);
        self.price_1_cumulative_last = next_price_1_cumulative;

        self.last_update_ts = now;

        Ok(())
    }
}
