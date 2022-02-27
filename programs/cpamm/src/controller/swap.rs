//! [crate::cpamm::swap] instruction controller.

use anchor_lang::prelude::*;
use anchor_spl::token;
use vipers::unwrap_int;

use crate::{Swap, SwapEvent};
use xyk::SwapResult;

pub struct SwapArgs {
    pub amount_in: u64,
    pub minimum_amount_out: u64,
}

/// Swap
pub fn swap(ctx: Context<Swap>, args: SwapArgs) -> Result<()> {
    // update cumulative price info.
    // must be called BEFORE mutation.
    ctx.accounts.update_cumulative_price_info()?;

    let (input_reserve, output_reserve) = (
        ctx.accounts.input.reserve.amount,
        ctx.accounts.output.reserve.amount,
    );

    let swap_fees = ctx.accounts.user.swap.fees;
    let token_swap = &ctx.accounts.user.swap;

    // compute the swap
    let swap_result = unwrap_int!(xyk::swap(args.amount_in, input_reserve, output_reserve));
    if swap_result.destination_amount_swapped == 0 {
        // skip the transfers if nothing is being swapped
        return Ok(());
    }

    let (trade_fee, admin_trade_fee) =
        unwrap_int!(swap_fees.compute_trade_fees(swap_result.destination_amount_swapped));

    // Transfer user's tokens to the pool.
    let token_program = &ctx.accounts.user.token_program;
    token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.input.user.to_account_info(),
                to: ctx.accounts.input.reserve.to_account_info(),
                authority: ctx.accounts.user.user_authority.to_account_info(),
            },
        ),
        swap_result.source_amount_swapped,
    )?;

    let seeds = gen_swap_signer_seeds!(token_swap);

    if admin_trade_fee > 0 {
        // Transfer user's fee to the fees account.
        let signer_seeds = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.output.reserve.to_account_info(),
                    to: ctx.accounts.output.fees.to_account_info(),
                    authority: token_swap.to_account_info(),
                },
                signer_seeds,
            ),
            admin_trade_fee,
        )?;
    }

    // Transfer pool's tokens to the user.
    let signer_seeds = &[&seeds[..]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.output.reserve.to_account_info(),
                to: ctx.accounts.output.user.to_account_info(),
                authority: token_swap.to_account_info(),
            },
            signer_seeds,
        ),
        unwrap_int!(swap_result
            .destination_amount_swapped
            .checked_sub(trade_fee)),
    )?;

    emit!(SwapEvent {
        lp_mint: ctx.accounts.user.swap.pool_mint,
        input_mint: ctx.accounts.input.reserve.mint,
        output_mint: ctx.accounts.output.reserve.mint,
        source_amount_swapped: swap_result.source_amount_swapped,
        destination_amount_swapped: swap_result.destination_amount_swapped,
    });

    ctx.accounts
        .track_cumulative_swap_volume(&swap_result, trade_fee)?;

    Ok(())
}

impl<'info> Swap<'info> {
    fn update_cumulative_price_info(&mut self) -> Result<()> {
        // update price info
        let swap_info = &mut self.user.swap;
        let (reserve_a, reserve_b) = if self.input.reserve.mint == swap_info.token_0.mint {
            (self.input.reserve.amount, self.output.reserve.amount)
        } else {
            (self.output.reserve.amount, self.input.reserve.amount)
        };
        swap_info
            .price_info
            .update_cumulative_price_info(reserve_a, reserve_b)?;
        Ok(())
    }

    /// Tracks and saves the cumulative swap volume.
    fn track_cumulative_swap_volume(
        &mut self,
        swap_result: &SwapResult,
        trade_fee: u64,
    ) -> Result<()> {
        // record cumulative volume numbers
        let token_0_mint = self.user.swap.token_0.mint;
        let swap_info = &mut self.user.swap;
        let cumulative_stats = &mut swap_info.cumulative_stats;
        let (cum_input_token, cum_output_token) = if self.input.reserve.mint == token_0_mint {
            (&mut cumulative_stats.token_0, &mut cumulative_stats.token_1)
        } else {
            (&mut cumulative_stats.token_1, &mut cumulative_stats.token_0)
        };

        cum_input_token.total_input_volume = unwrap_int!(cum_input_token
            .total_input_volume
            .checked_add(swap_result.source_amount_swapped.into()));
        cum_output_token.total_output_volume = unwrap_int!(cum_output_token
            .total_output_volume
            .checked_add(swap_result.destination_amount_swapped.into()));
        cum_output_token.total_trade_fees =
            unwrap_int!(cum_output_token.total_trade_fees.checked_add(trade_fee));

        Ok(())
    }
}
