//! [crate::cpamm::withdraw] instruction processor.

use crate::*;
use anchor_spl::token;

use xyk::{pool_tokens_to_trading_tokens, RoundDirection};

pub struct WithdrawArgs {
    pub amount_in: u64,
    pub minimum_amount_out_0: u64,
    pub minimum_amount_out_1: u64,
}

/// Withdraw
pub fn withdraw(ctx: Context<Withdraw>, args: WithdrawArgs) -> Result<()> {
    // update cumulative price info.
    // we call this before the short circuit
    // so the numbers are accurate.
    ctx.accounts.update_cumulative_price_info()?;

    // skip the withdrawal if nothing is being withdrawn
    if args.amount_in == 0 {
        return Ok(());
    }

    let result = unwrap_int!(pool_tokens_to_trading_tokens(
        args.amount_in,
        ctx.accounts.pool_mint.supply,
        ctx.accounts.output_0.reserve.amount,
        ctx.accounts.output_1.reserve.amount,
        RoundDirection::Floor,
    ));

    let token_0_amount = std::cmp::min(ctx.accounts.output_0.reserve.amount, result.token_a_amount);
    let token_1_amount = std::cmp::min(ctx.accounts.output_1.reserve.amount, result.token_b_amount);

    // pool token output should be at least 1 for each token
    invariant!(token_0_amount > 0, InsufficientLiquidity);
    invariant!(token_1_amount > 0, InsufficientLiquidity);

    // ensure we are meeting the max slippage
    invariant!(
        token_0_amount >= args.minimum_amount_out_0,
        ExceededSlippage
    );
    invariant!(
        token_1_amount >= args.minimum_amount_out_1,
        ExceededSlippage
    );

    // Burn LP tokens
    let token_program = &ctx.accounts.user.token_program;
    token::burn(
        CpiContext::new(
            token_program.to_account_info(),
            token::Burn {
                mint: ctx.accounts.pool_mint.to_account_info(),
                from: ctx.accounts.input_lp.to_account_info(),
                authority: ctx.accounts.user.user_authority.to_account_info(),
            },
        ),
        args.amount_in,
    )?;

    // Transfer tokens from reserve to user
    ctx.accounts
        .withdraw_token(&ctx.accounts.output_0, token_0_amount)?;
    ctx.accounts
        .withdraw_token(&ctx.accounts.output_1, token_1_amount)?;

    emit!(WithdrawEvent {
        lp_mint: ctx.accounts.pool_mint.key(),
        pool_token_amount: args.amount_in,
        token_0_amount,
        token_1_amount
    });

    ctx.accounts.track_cumulative_withdraw_volume(
        args.amount_in,
        token_0_amount,
        token_1_amount,
    )?;

    ctx.accounts.pool_mint.reload()?;
    invariant!(
        ctx.accounts.pool_mint.supply >= xyk::MINIMUM_LIQUIDITY,
        InsufficientLiquidityPostWithdrawal
    );

    Ok(())
}

impl<'info> Withdraw<'info> {
    fn update_cumulative_price_info(&mut self) -> Result<()> {
        // update price info
        let price_info = &mut self.user.swap.price_info;
        price_info.update_cumulative_price_info(
            self.output_0.reserve.amount,
            self.output_1.reserve.amount,
        )
    }

    /// Tracks and saves the cumulative swap volume.
    fn track_cumulative_withdraw_volume(
        &mut self,
        pool_token_amount: u64,
        token_0_amount: u64,
        token_1_amount: u64,
    ) -> Result<()> {
        // record cumulative volume numbers
        let cumulative_stats = &mut self.user.swap.cumulative_stats;
        cumulative_stats.total_lp_redeemed = unwrap_int!(cumulative_stats
            .total_lp_redeemed
            .checked_add(pool_token_amount.into()));
        cumulative_stats.token_0.total_withdraw_volume = unwrap_int!(cumulative_stats
            .token_0
            .total_withdraw_volume
            .checked_add(token_0_amount.into()));
        cumulative_stats.token_1.total_withdraw_volume = unwrap_int!(cumulative_stats
            .token_1
            .total_withdraw_volume
            .checked_add(token_1_amount.into()));
        Ok(())
    }

    /// Withdraws a token.
    fn withdraw_token(&self, output: &SwapTokenWithFees<'info>, amount: u64) -> Result<()> {
        let token_swap = &self.user.swap;
        let token_program = &self.user.token_program;

        let swap_fees = self.user.swap.fees;
        let (withdraw_fee, admin_withdraw_fee) =
            unwrap_int!(swap_fees.compute_withdraw_fees(amount));

        // Transfer token from reserve to user
        let seeds = gen_swap_signer_seeds!(token_swap);
        let signer_seeds = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info().clone(),
                token::Transfer {
                    from: output.reserve.to_account_info(),
                    to: output.user.to_account_info(),
                    authority: token_swap.to_account_info(),
                },
                signer_seeds,
            ),
            unwrap_int!(amount.checked_sub(withdraw_fee)),
        )?;

        if admin_withdraw_fee > 0 {
            // Transfer withdrawal fee of token to admin address
            let signer_seeds = &[&seeds[..]];
            token::transfer(
                CpiContext::new_with_signer(
                    token_program.to_account_info().clone(),
                    token::Transfer {
                        from: output.reserve.to_account_info(),
                        to: output.fees.to_account_info(),
                        authority: token_swap.to_account_info(),
                    },
                    signer_seeds,
                ),
                admin_withdraw_fee,
            )?;
        }

        Ok(())
    }
}
