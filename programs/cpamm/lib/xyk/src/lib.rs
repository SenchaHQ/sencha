//! The constant product invariant calculator.

use num_traits::ToPrimitive;
use spl_math::checked_ceil_div::CheckedCeilDiv;

mod types;

pub use types::*;

/// Initial amount of pool tokens for swap contract, calculated as the geometric mean of the two
/// initial token liquidity amounts.
pub fn calculate_initial_swap_pool_amount(amount_a: u64, amount_b: u64) -> Option<u64> {
    spl_math::approximations::sqrt((amount_a as u128).checked_mul(amount_b as u128)?)?.to_u64()
}

// Minimum liquidity owned by the swap so that balances cannot be completely withdrawn
// unless the pool dissolves
pub const MINIMUM_LIQUIDITY: u64 = 1_000;

/// Constant product swap ensures x * y = constant
///
/// This is guaranteed to work for all values such that:
///  - 1 <= swap_source_amount * swap_destination_amount <= u128::MAX
///  - 1 <= source_amount <= u64::MAX
pub fn swap(
    source_amount: u64,
    swap_source_amount: u64,
    swap_destination_amount: u64,
) -> Option<SwapResult> {
    let invariant = (swap_source_amount as u128).checked_mul(swap_destination_amount.into())?;

    let new_swap_source_amount = (swap_source_amount as u128).checked_add(source_amount.into())?;
    let (new_swap_destination_amount, new_swap_source_amount) =
        invariant.checked_ceil_div(new_swap_source_amount)?;

    let source_amount_swapped = new_swap_source_amount
        .checked_sub(swap_source_amount.into())?
        .to_u64()?;

    // zero swap should not execute
    if source_amount_swapped == 0 {
        return None;
    }

    let destination_amount_swapped =
        (swap_destination_amount).checked_sub(new_swap_destination_amount.to_u64()?)?;

    // zero swap should not execute
    if destination_amount_swapped == 0 {
        return None;
    }

    Some(SwapResult {
        source_amount_swapped,
        destination_amount_swapped,
    })
}

/// Get the amount of trading tokens for the given amount of pool tokens,
/// provided the total trading tokens and supply of pool tokens.
///
/// The constant product implementation is a simple ratio calculation for how many
/// trading tokens correspond to a certain number of pool tokens
pub fn pool_tokens_to_trading_tokens(
    pool_tokens: u64,
    pool_token_supply: u64,
    swap_token_a_amount: u64,
    swap_token_b_amount: u64,
    round_direction: RoundDirection,
) -> Option<TradingTokenResult> {
    let mut token_a_amount = (pool_tokens as u128)
        .checked_mul(swap_token_a_amount.into())?
        .checked_div(pool_token_supply.into())?
        .to_u64()?;
    let mut token_b_amount = (pool_tokens as u128)
        .checked_mul(swap_token_b_amount.into())?
        .checked_div(pool_token_supply.into())?
        .to_u64()?;
    let (token_a_amount, token_b_amount) = match round_direction {
        RoundDirection::Floor => (token_a_amount, token_b_amount),
        RoundDirection::Ceiling => {
            let token_a_remainder = (pool_tokens as u128)
                .checked_mul(swap_token_a_amount.into())?
                .checked_rem(pool_token_supply.into())?;
            // Also check for 0 token A and B amount to avoid taking too much
            // for tiny amounts of pool tokens.  For example, if someone asks
            // for 1 pool token, which is worth 0.01 token A, we avoid the
            // ceiling of taking 1 token A and instead return 0, for it to be
            // rejected later in processing.
            if token_a_remainder > 0 && token_a_amount > 0 {
                token_a_amount += 1;
            }
            let token_b_remainder = (pool_tokens as u128)
                .checked_mul(swap_token_b_amount.into())?
                .checked_rem(pool_token_supply.into())?;
            if token_b_remainder > 0 && token_b_amount > 0 {
                token_b_amount += 1;
            }
            (token_a_amount, token_b_amount)
        }
    };
    Some(TradingTokenResult {
        token_a_amount,
        token_b_amount,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::RoundDirection;
    use proptest::prelude::*;
    use spl_math::precise_number::PreciseNumber;
    use spl_math::uint::U256;

    const MAX_SWAP_AMOUNT: u64 = u64::MAX >> 4;

    /// Calculates the total normalized value of the curve given the liquidity
    /// parameters.
    ///
    /// The constant product implementation for this function gives the square root of
    /// the Uniswap invariant.
    fn normalized_value(
        swap_token_a_amount: u64,
        swap_token_b_amount: u64,
    ) -> Option<PreciseNumber> {
        let swap_token_a_amount = PreciseNumber::new(swap_token_a_amount.into())?;
        let swap_token_b_amount = PreciseNumber::new(swap_token_b_amount.into())?;
        swap_token_a_amount
            .checked_mul(&swap_token_b_amount)?
            .sqrt()
    }

    /// Test function checking that a swap never reduces the overall value of
    /// the pool.
    ///
    /// Since curve calculations use unsigned integers, there is potential for
    /// truncation at some point, meaning a potential for value to be lost in
    /// either direction if too much is given to the swapper.
    ///
    /// This test guarantees that the relative change in value will be at most
    /// 1 normalized token, and that the value will never decrease from a trade.
    pub fn check_curve_value_from_swap(
        source_token_amount: u64,
        swap_source_amount: u64,
        swap_destination_amount: u64,
    ) {
        let results = swap(
            source_token_amount,
            swap_source_amount,
            swap_destination_amount,
        )
        .unwrap();

        let previous_value = normalized_value(swap_source_amount, swap_destination_amount).unwrap();

        let new_swap_source_amount = swap_source_amount
            .checked_add(results.source_amount_swapped)
            .unwrap();
        let new_swap_destination_amount = swap_destination_amount
            .checked_sub(results.destination_amount_swapped)
            .unwrap();

        let new_value =
            normalized_value(new_swap_source_amount, new_swap_destination_amount).unwrap();
        assert!(new_value.greater_than_or_equal(&previous_value));

        let epsilon = 1; // Extremely close!
        let difference = new_value
            .checked_sub(&previous_value)
            .unwrap()
            .to_imprecise()
            .unwrap();
        assert!(difference <= epsilon);
    }

    /// Test function checking that a deposit never reduces the value of pool
    /// tokens.
    ///
    /// Since curve calculations use unsigned integers, there is potential for
    /// truncation at some point, meaning a potential for value to be lost if
    /// too much is given to the depositor.
    pub fn check_pool_value_from_deposit(
        pool_token_amount: u64,
        pool_token_supply: u64,
        swap_token_a_amount: u64,
        swap_token_b_amount: u64,
    ) {
        let deposit_result = pool_tokens_to_trading_tokens(
            pool_token_amount,
            pool_token_supply,
            swap_token_a_amount,
            swap_token_b_amount,
            RoundDirection::Ceiling,
        )
        .unwrap();
        let new_swap_token_a_amount = swap_token_a_amount + deposit_result.token_a_amount;
        let new_swap_token_b_amount = swap_token_b_amount + deposit_result.token_b_amount;
        let new_pool_token_supply = pool_token_supply + pool_token_amount;

        // the following inequality must hold:
        // new_token_a / new_pool_token_supply >= token_a / pool_token_supply
        // which reduces to:
        // new_token_a * pool_token_supply >= token_a * new_pool_token_supply

        // These numbers can be just slightly above u64 after the deposit, which
        // means that their multiplication can be just above the range of u64.
        // For ease of testing, we bump these up to U256.
        let pool_token_supply = U256::from(pool_token_supply);
        let new_pool_token_supply = U256::from(new_pool_token_supply);
        let swap_token_a_amount = U256::from(swap_token_a_amount);
        let new_swap_token_a_amount = U256::from(new_swap_token_a_amount);
        let swap_token_b_amount = U256::from(swap_token_b_amount);
        let new_swap_token_b_amount = U256::from(new_swap_token_b_amount);

        assert!(
            new_swap_token_a_amount * pool_token_supply
                >= swap_token_a_amount * new_pool_token_supply
        );
        assert!(
            new_swap_token_b_amount * pool_token_supply
                >= swap_token_b_amount * new_pool_token_supply
        );
    }

    /// Test function checking that a withdraw never reduces the value of pool
    /// tokens.
    ///
    /// Since curve calculations use unsigned integers, there is potential for
    /// truncation at some point, meaning a potential for value to be lost if
    /// too much is given to the depositor.
    pub fn check_pool_value_from_withdraw(
        pool_token_amount: u64,
        pool_token_supply: u64,
        swap_token_a_amount: u64,
        swap_token_b_amount: u64,
    ) {
        let withdraw_result = pool_tokens_to_trading_tokens(
            pool_token_amount,
            pool_token_supply,
            swap_token_a_amount,
            swap_token_b_amount,
            RoundDirection::Floor,
        )
        .unwrap();
        let new_swap_token_a_amount = swap_token_a_amount - withdraw_result.token_a_amount;
        let new_swap_token_b_amount = swap_token_b_amount - withdraw_result.token_b_amount;
        let new_pool_token_supply = pool_token_supply - pool_token_amount;

        let value = normalized_value(swap_token_a_amount, swap_token_b_amount).unwrap();
        // since we can get rounding issues on the pool value which make it seem that the
        // value per token has gone down, we bump it up by an epsilon of 1 to
        // cover all cases
        let new_value = normalized_value(new_swap_token_a_amount, new_swap_token_b_amount).unwrap();

        // the following inequality must hold:
        // new_pool_value / new_pool_token_supply >= pool_value / pool_token_supply
        // which can also be written:
        // new_pool_value * pool_token_supply >= pool_value * new_pool_token_supply

        let pool_token_supply = PreciseNumber::new(pool_token_supply.into()).unwrap();
        let new_pool_token_supply = PreciseNumber::new(new_pool_token_supply.into()).unwrap();
        assert!(new_value
            .checked_mul(&pool_token_supply)
            .unwrap()
            .greater_than_or_equal(&value.checked_mul(&new_pool_token_supply).unwrap()));
    }

    prop_compose! {
        pub fn total_and_intermediate()(total in 1..MAX_SWAP_AMOUNT)
                        (intermediate in 1..total, total in Just(total))
                        -> (u64, u64) {
            (total, intermediate)
        }
    }

    fn check_pool_token_rate(
        token_a: u64,
        token_b: u64,
        deposit: u64,
        supply: u64,
        expected_a: u64,
        expected_b: u64,
    ) {
        let results = pool_tokens_to_trading_tokens(
            deposit,
            supply,
            token_a,
            token_b,
            RoundDirection::Ceiling,
        )
        .unwrap();
        assert_eq!(results.token_a_amount, expected_a);
        assert_eq!(results.token_b_amount, expected_b);
    }

    #[test]
    fn trading_token_conversion() {
        check_pool_token_rate(2, 49, 5, 10, 1, 25);
        check_pool_token_rate(100, 202, 5, 101, 5, 10);
        check_pool_token_rate(5, 501, 2, 10, 1, 101);
    }

    #[test]
    fn fail_trading_token_conversion() {
        let results =
            pool_tokens_to_trading_tokens(u64::MAX, 100, u64::MAX, 0, RoundDirection::Floor);
        assert!(results.is_none());
        let results =
            pool_tokens_to_trading_tokens(u64::MAX, 10, 0, u64::MAX, RoundDirection::Floor);
        assert!(results.is_none());
    }

    fn test_truncation(
        source_amount: u64,
        swap_source_amount: u64,
        swap_destination_amount: u64,
        expected_source_amount_swapped: u64,
        expected_destination_amount_swapped: u64,
    ) {
        let invariant = swap_source_amount * swap_destination_amount;
        let result = swap(source_amount, swap_source_amount, swap_destination_amount).unwrap();
        assert_eq!(result.source_amount_swapped, expected_source_amount_swapped);
        assert_eq!(
            result.destination_amount_swapped,
            expected_destination_amount_swapped
        );
        let new_invariant = (swap_source_amount + result.source_amount_swapped)
            * (swap_destination_amount - result.destination_amount_swapped);
        assert!(new_invariant >= invariant);
    }

    #[test]
    fn constant_product_swap_rounding() {
        // much too small
        assert!(swap(10, 70_000_000_000, 4_000_000).is_none()); // spot: 10 * 4m / 70b = 0

        let tests: &[(u64, u64, u64, u64, u64)] = &[
            (10, 4_000_000, 70_000_000_000, 10, 174_999), // spot: 10 * 70b / ~4m = 174,999.99
            (20, 30_000 - 20, 10_000, 18, 6), // spot: 20 * 1 / 3.000 = 6.6667 (source can be 18 to get 6 dest.)
            (19, 30_000 - 20, 10_000, 18, 6), // spot: 19 * 1 / 2.999 = 6.3334 (source can be 18 to get 6 dest.)
            (18, 30_000 - 20, 10_000, 18, 6), // spot: 18 * 1 / 2.999 = 6.0001
            (10, 20_000, 30_000, 10, 14),     // spot: 10 * 3 / 2.0010 = 14.99
            (10, 20_000 - 9, 30_000, 10, 14), // spot: 10 * 3 / 2.0001 = 14.999
            (10, 20_000 - 10, 30_000, 10, 15), // spot: 10 * 3 / 2.0000 = 15
            (100, 60_000, 30_000, 99, 49), // spot: 100 * 3 / 6.001 = 49.99 (source can be 99 to get 49 dest.)
            (99, 60_000, 30_000, 99, 49),  // spot: 99 * 3 / 6.001 = 49.49
            (98, 60_000, 30_000, 97, 48), // spot: 98 * 3 / 6.001 = 48.99 (source can be 97 to get 48 dest.)
        ];
        for (
            source_amount,
            swap_source_amount,
            swap_destination_amount,
            expected_source_amount,
            expected_destination_amount,
        ) in tests.iter()
        {
            test_truncation(
                *source_amount,
                *swap_source_amount,
                *swap_destination_amount,
                *expected_source_amount,
                *expected_destination_amount,
            );
        }
    }

    proptest! {
        #[test]
        fn curve_value_does_not_decrease_from_swap(
            source_token_amount in 1..MAX_SWAP_AMOUNT,
            swap_source_amount in 1..MAX_SWAP_AMOUNT,
            swap_destination_amount in 1..MAX_SWAP_AMOUNT,
        ) {
            check_curve_value_from_swap(
                source_token_amount as u64,
                swap_source_amount as u64,
                swap_destination_amount as u64,
            );
        }
    }

    proptest! {
        #[test]
        fn curve_value_does_not_decrease_from_deposit(
            pool_token_amount in 1..u32::MAX,
            pool_token_supply in 1..u32::MAX,
            swap_token_a_amount in 1..u32::MAX,
            swap_token_b_amount in 1..u32::MAX,
        ) {
            let pool_token_amount = pool_token_amount as u64;
            let pool_token_supply = pool_token_supply as u64;
            let swap_token_a_amount = swap_token_a_amount as u64;
            let swap_token_b_amount = swap_token_b_amount as u64;
            // Make sure we will get at least one trading token out for each
            // side, otherwise the calculation fails
            prop_assume!((pool_token_amount as u128) * (swap_token_a_amount as u128) / (pool_token_supply as u128) >= 1);
            prop_assume!((pool_token_amount as u128) * (swap_token_b_amount as u128) / (pool_token_supply as u128) >= 1);
            check_pool_value_from_deposit(
                pool_token_amount,
                pool_token_supply,
                swap_token_a_amount,
                swap_token_b_amount,
            );
        }
    }

    proptest! {
        #[test]
        fn curve_value_does_not_decrease_from_withdraw(
            (pool_token_supply, pool_token_amount) in total_and_intermediate(),
            swap_token_a_amount in 1..MAX_SWAP_AMOUNT,
            swap_token_b_amount in 1..MAX_SWAP_AMOUNT,
        ) {
            let pool_token_amount = pool_token_amount as u64;
            let pool_token_supply = pool_token_supply as u64;
            let swap_token_a_amount = swap_token_a_amount as u64;
            let swap_token_b_amount = swap_token_b_amount as u64;
            // Make sure we will get at least one trading token out for each
            // side, otherwise the calculation fails
            prop_assume!((pool_token_amount as u128) * (swap_token_a_amount as u128) / (pool_token_supply as u128) >= 1);
            prop_assume!((pool_token_amount as u128) * (swap_token_b_amount as u128) / (pool_token_supply as u128) >= 1);
            check_pool_value_from_withdraw(
                pool_token_amount,
                pool_token_supply,
                swap_token_a_amount,
                swap_token_b_amount,
            );
        }
    }
}
