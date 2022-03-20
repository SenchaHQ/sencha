//! [crate::cpamm::deposit] instruction controller.

use crate::*;
use anchor_spl::token;

/// Deposit
pub fn deposit(ctx: Context<Deposit>, args: DepositArgs) -> Result<()> {
    // update cumulative price info.
    // we call this before the short circuit
    // so the numbers are accurate.
    ctx.accounts.update_cumulative_price_info()?;

    let pool_mint_supply = ctx.accounts.pool_mint.supply;
    invariant!(pool_mint_supply > 0, "pool_mint.supply cannot be 0");
    let pool_token_amount = args.pool_token_amount;
    if pool_token_amount == 0 {
        return Ok(());
    }

    invariant!(args.maximum_amount_in_0 > 0, "args.maximum_amount_in_a > 0");
    invariant!(args.maximum_amount_in_1 > 0, "args.maximum_amount_in_b > 0");

    let result = unwrap_int!(xyk::pool_tokens_to_trading_tokens(
        pool_token_amount,
        pool_mint_supply,
        ctx.accounts.input_0.reserve.amount,
        ctx.accounts.input_1.reserve.amount,
        xyk::RoundDirection::Ceiling,
    ));

    invariant!(
        result.token_a_amount <= args.maximum_amount_in_0,
        ExceededSlippage
    );
    invariant!(result.token_a_amount > 0, InsufficientLiquidity);
    invariant!(
        result.token_b_amount <= args.maximum_amount_in_1,
        ExceededSlippage
    );
    invariant!(result.token_b_amount > 0, InsufficientLiquidity);

    // Transfer user's tokens to the reserve.
    ctx.accounts
        .transfer_user_to_reserve(&ctx.accounts.input_0, result.token_a_amount)?;
    ctx.accounts
        .transfer_user_to_reserve(&ctx.accounts.input_1, result.token_b_amount)?;

    // Mint lp tokens to user
    ctx.accounts.mint_lp_to_user(pool_token_amount)?;

    emit!(DepositEvent {
        lp_mint: ctx.accounts.user.swap.pool_mint,
        pool_token_amount,
        token_0_amount: result.token_a_amount,
        token_1_amount: result.token_b_amount,
    });

    ctx.accounts.track_cumulative_deposit_volume(
        pool_token_amount,
        result.token_a_amount,
        result.token_b_amount,
    )?;

    Ok(())
}

pub struct DepositArgs {
    pub pool_token_amount: u64,
    pub maximum_amount_in_0: u64,
    pub maximum_amount_in_1: u64,
}

impl<'info> Deposit<'info> {
    /// Transfers the user's swap tokens to the reserve.
    fn transfer_user_to_reserve(&self, input: &SwapToken<'info>, amount: u64) -> Result<()> {
        let token_program = &self.user.token_program;
        let cpi_ctx = CpiContext::new(
            token_program.to_account_info().clone(),
            token::Transfer {
                from: input.user.to_account_info(),
                to: input.reserve.to_account_info(),
                authority: self.user.user_authority.to_account_info().clone(),
            },
        );
        token::transfer(cpi_ctx, amount)
    }

    /// Mints the LP tokens to the user.
    fn mint_lp_to_user(&self, amount: u64) -> Result<()> {
        let token_swap = &self.user.swap;
        let seeds = gen_swap_signer_seeds!(token_swap);
        let signer_seeds = &[&seeds[..]];
        token::mint_to(
            CpiContext::new_with_signer(
                self.user.token_program.to_account_info(),
                token::MintTo {
                    mint: self.pool_mint.to_account_info(),
                    to: self.output_lp.to_account_info(),
                    authority: token_swap.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )
    }

    fn update_cumulative_price_info(&mut self) -> Result<()> {
        // update price info
        let price_info = &mut self.user.swap.price_info;
        price_info
            .update_cumulative_price_info(self.input_0.reserve.amount, self.input_1.reserve.amount)
    }

    /// Tracks and saves the cumulative deposit volume.
    fn track_cumulative_deposit_volume(
        &mut self,
        pool_token_amount: u64,
        token_0_amount: u64,
        token_1_amount: u64,
    ) -> Result<()> {
        // record cumulative volume numbers
        let cumulative_stats = &mut self.user.swap.cumulative_stats;
        cumulative_stats.total_lp_minted = unwrap_int!(cumulative_stats
            .total_lp_minted
            .checked_add(pool_token_amount.into()));
        cumulative_stats.token_0.total_deposit_volume = unwrap_int!(cumulative_stats
            .token_0
            .total_deposit_volume
            .checked_add(token_0_amount.into()));
        cumulative_stats.token_1.total_deposit_volume = unwrap_int!(cumulative_stats
            .token_1
            .total_deposit_volume
            .checked_add(token_1_amount.into()));
        Ok(())
    }
}
