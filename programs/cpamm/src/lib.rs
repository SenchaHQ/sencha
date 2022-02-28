//! Constant product automated market maker.
#![deny(rustdoc::all)]
#![allow(rustdoc::missing_doc_code_examples)]

#[macro_use]
mod macros;

use anchor_lang::prelude::*;
use anchor_spl::token::MintTo;
use vipers::prelude::*;

mod account_structs;
mod account_validators;
mod addresses;
mod controller;
mod events;
mod state;

pub mod fees;
pub mod price_info;

pub use account_structs::*;
pub use events::*;
pub use state::*;

declare_id!("SCHAtsf8mbjyjiv4LkhLKutTf6JnZAbdJKFkXQNMFHZ");

/// Constant product AMM.
#[program]
pub mod cpamm {
    use anchor_spl::token;

    use super::*;

    /// Creates a new [Factory].
    #[access_control(ctx.accounts.validate())]
    pub fn new_factory(ctx: Context<NewFactory>, _bump: u8) -> Result<()> {
        msg!("Instruction: NewFactory");

        let factory = &mut ctx.accounts.factory;

        factory.base = ctx.accounts.base.key();
        factory.bump = unwrap_bump!(ctx, "factory");
        factory.num_swaps = 0;
        factory.admin = addresses::ADMIN_ACCOUNT;

        Ok(())
    }

    /// Creates a new [SwapInfo].
    #[access_control(ctx.accounts.validate())]
    pub fn new_swap(ctx: Context<NewSwap>, _bump: u8) -> Result<()> {
        let token_0 = &ctx.accounts.token_0;
        let token_1 = &ctx.accounts.token_1;
        invariant!(token_0.reserve.amount != 0, NewSwapMustHaveNonZeroSupply);
        invariant!(token_1.reserve.amount != 0, NewSwapMustHaveNonZeroSupply);

        let initial_liquidity = unwrap_int!(xyk::calculate_initial_swap_pool_amount(
            token_0.reserve.amount,
            token_1.reserve.amount
        ));
        invariant!(
            initial_liquidity >= xyk::MINIMUM_LIQUIDITY,
            InitialLiquidityTooLow
        );

        // update factory index
        let factory = &mut ctx.accounts.factory;
        let index = factory.num_swaps;
        factory.num_swaps = unwrap_int!(index.checked_add(1));

        // init info
        let swap_info = &mut ctx.accounts.swap;
        swap_info.factory = factory.key();
        swap_info.bump = unwrap_bump!(ctx, "swap");

        swap_info.index = index;
        swap_info.admin_key = factory.admin;
        swap_info.token_0 = SwapTokenInfo::from(token_0);
        swap_info.token_1 = SwapTokenInfo::from(token_1);

        swap_info.is_paused = false;
        swap_info.pool_mint = ctx.accounts.pool_mint.key();
        swap_info.fees = fees::INITIAL;

        // Zero cumulative stats.
        swap_info.cumulative_stats = Default::default();

        // set up initial price info
        swap_info.price_info = SwapPriceInfo {
            last_update_ts: Clock::get()?.unix_timestamp,
            // zero cumulative price because no time has elapsed
            price_0_cumulative_last: 0,
            price_1_cumulative_last: 0,
        };

        // mint initial liquidity to initial staker
        let seeds = gen_swap_signer_seeds!(swap_info);
        let signer_seeds = &[&seeds[..]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.pool_mint.to_account_info(),
                    to: ctx.accounts.output_lp.to_account_info(),
                    authority: swap_info.to_account_info(),
                },
                signer_seeds,
            ),
            initial_liquidity,
        )?;

        emit!(NewPoolEvent {
            lp_mint: ctx.accounts.pool_mint.key(),
            mint_0: token_0.mint.key(),
            mint_1: token_1.mint.key(),
            initial_liquidity
        });

        Ok(())
    }

    /// Creates a new [SwapMeta].
    #[access_control(ctx.accounts.validate())]
    pub fn new_swap_meta(ctx: Context<NewSwapMeta>, _bump: u8) -> Result<()> {
        let swap_info = &ctx.accounts.swap;

        // init meta
        let meta = &mut ctx.accounts.swap_meta;
        meta.factory = swap_info.factory;
        meta.index = swap_info.index;
        meta.bump = unwrap_bump!(ctx, "swap_meta");
        meta.swap = swap_info.key();
        meta.created_at = Clock::get()?.unix_timestamp;
        meta.created_by = ctx.accounts.payer.key();

        Ok(())
    }

    /// Performs a swap.
    #[access_control(ctx.accounts.validate())]
    pub fn swap(ctx: Context<Swap>, amount_in: u64, minimum_amount_out: u64) -> Result<()> {
        controller::swap::swap(
            ctx,
            controller::swap::SwapArgs {
                amount_in,
                minimum_amount_out,
            },
        )
    }

    /// Performs a swap of the maximum amount possible.
    /// This is useful for order routers.
    #[access_control(ctx.accounts.validate())]
    pub fn swap_max(ctx: Context<Swap>, minimum_amount_out: u64) -> Result<()> {
        let amount_in = ctx.accounts.input.user.amount;
        controller::swap::swap(
            ctx,
            controller::swap::SwapArgs {
                amount_in,
                minimum_amount_out,
            },
        )
    }

    /// Performs a withdraw.
    #[access_control(ctx.accounts.validate())]
    pub fn withdraw(
        ctx: Context<Withdraw>,
        amount_in: u64,
        minimum_amount_out_0: u64,
        minimum_amount_out_1: u64,
    ) -> Result<()> {
        controller::withdraw::withdraw(
            ctx,
            controller::withdraw::WithdrawArgs {
                amount_in,
                minimum_amount_out_0,
                minimum_amount_out_1,
            },
        )
    }

    /// Performs a deposit.
    #[access_control(ctx.accounts.validate())]
    pub fn deposit(
        ctx: Context<Deposit>,
        pool_token_amount: u64,
        maximum_amount_in_0: u64,
        maximum_amount_in_1: u64,
    ) -> Result<()> {
        // update price info
        let price_info = &mut ctx.accounts.user.swap.price_info;
        price_info.update_cumulative_price_info(
            ctx.accounts.input_0.reserve.amount,
            ctx.accounts.input_1.reserve.amount,
        )?;

        controller::deposit::deposit(
            ctx,
            controller::deposit::DepositArgs {
                pool_token_amount,
                maximum_amount_in_0,
                maximum_amount_in_1,
            },
        )?;
        Ok(())
    }
}

// Error codes
#[error_code]
#[allow(missing_docs)]
pub enum ErrorCode {
    #[msg("Swap pool is paused")]
    Paused,
    #[msg("Swap instruction exceeds desired slippage limit")]
    ExceededSlippage,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg(
        "The withdrawal will result in the pool having too little liquidity. Withdraw less tokens."
    )]
    InsufficientLiquidityPostWithdrawal,

    #[msg("New swap must have non-zero supply on its reserves", offset = 10)]
    NewSwapMustHaveNonZeroSupply,
    #[msg("Initial liquidity too low")]
    InitialLiquidityTooLow,
    #[msg("Swap's token mints must be sorted")]
    SwapTokensNotSorted,
    #[msg("Swap's token mints cannot be the same")]
    SwapTokensCannotBeEqual,
    #[msg("Swap's pool mint supply must be zero")]
    SwapPoolMintSupply,
    #[msg("Invalid fee", offset = 20)]
    InvalidFee,
}
