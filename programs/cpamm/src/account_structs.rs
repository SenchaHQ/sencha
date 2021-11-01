//! Accounts structs.

use crate::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Accounts for a [cpamm::new_factory] instruction.
#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct NewFactory<'info> {
    /// Base key to create the [Factory].
    pub base: Signer<'info>,

    /// The [Factory].
    #[account(
        init,
        seeds = [
            b"Factory",
            base.key().as_ref()
        ],
        bump = bump,
        payer = payer
    )]
    pub factory: Box<Account<'info, Factory>>,

    /// Payer.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// [System] program.
    pub system_program: Program<'info, System>,
}

/// Accounts for a [cpamm::new_swap] instruction.
#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct NewSwap<'info> {
    /// The [Factory].
    #[account(mut)]
    pub factory: Box<Account<'info, Factory>>,

    /// The swap account
    #[account(
        init,
        seeds = [
            b"SwapInfo",
            factory.key().to_bytes().as_ref(),
            token_0.mint.key().to_bytes().as_ref(),
            token_1.mint.key().to_bytes().as_ref()
        ],
        bump = bump,
        payer = payer
    )]
    pub swap: Box<Account<'info, SwapInfo>>,

    /// The pool mint of the swap.
    #[account(mut)]
    pub pool_mint: Box<Account<'info, Mint>>,
    /// The first token of the swap.
    pub token_0: InitSwapToken<'info>,
    /// The second token of the swap. Its mint must be
    /// after the first mint. using canonical ordering.
    pub token_1: InitSwapToken<'info>,
    /// The pool creator's LP [TokenAccount].
    #[account(mut)]
    pub output_lp: Box<Account<'info, TokenAccount>>,

    /// Payer.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// [Token] program.
    pub token_program: Program<'info, Token>,

    /// [System] program.
    pub system_program: Program<'info, System>,
}

/// Accounts for a [cpamm::new_swap_meta] instruction.
#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct NewSwapMeta<'info> {
    /// The swap account
    pub swap: Box<Account<'info, SwapInfo>>,

    /// The swap meta
    #[account(
        init,
        seeds = [
            b"SwapMeta",
            swap.factory.to_bytes().as_ref(),
            swap.index.to_le_bytes().as_ref()
        ],
        bump = bump,
        payer = payer
    )]
    pub swap_meta: Box<Account<'info, SwapMeta>>,

    /// Payer.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// [System] program.
    pub system_program: Program<'info, System>,
}

/// Accounts for a [cpamm::swap] instruction.
#[derive(Accounts)]
pub struct Swap<'info> {
    /// The context of the user performing the swap.
    pub user: SwapUserContext<'info>,
    /// The input token of the swap.
    pub input: SwapTokenWithFees<'info>,
    /// The output token of the swap.
    pub output: SwapTokenWithFees<'info>,
}

/// Accounts for a [cpamm::withdraw] instruction.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// The context of the user performing the swap.
    pub user: SwapUserContext<'info>,
    /// The pool mint of the swap.
    #[account(mut)]
    pub pool_mint: Account<'info, Mint>,
    /// The input token of the swap.
    #[account(mut)]
    pub input_lp: Account<'info, TokenAccount>,
    /// The 0 output token of the swap.
    pub output_0: SwapTokenWithFees<'info>,
    /// The 1 output token of the swap.
    pub output_1: SwapTokenWithFees<'info>,
}

/// Accounts for a [cpamm::deposit] instruction.
#[derive(Accounts)]
pub struct Deposit<'info> {
    /// The context of the user performing the swap.
    pub user: SwapUserContext<'info>,
    /// The input of token 0 of the swap.
    pub input_0: SwapToken<'info>,
    /// The input of token 1 of the swap.
    pub input_1: SwapToken<'info>,
    /// The pool mint of the swap.
    #[account(mut)]
    pub pool_mint: Box<Account<'info, Mint>>,
    /// The destination account for LP tokens.
    #[account(mut)]
    pub output_lp: Box<Account<'info, TokenAccount>>,
}

// --------------------------------
// Various accounts
// --------------------------------

/// Token accounts for the creation of a [SwapInfo].
#[derive(Accounts)]
pub struct InitSwapToken<'info> {
    /// The [Mint] of the token.
    pub mint: Box<Account<'info, Mint>>,
    /// The taken account for the pool's reserves of this token.
    pub reserve: Box<Account<'info, TokenAccount>>,
    /// The token account for the fees associated with the token.
    pub fees: Box<Account<'info, TokenAccount>>,
}

#[derive(Accounts)]
/// Context common to all router operations.
pub struct SwapUserContext<'info> {
    /// The [Token] program.
    pub token_program: Program<'info, Token>,
    /// The [SwapInfo] account.
    #[account(mut)]
    pub swap: Box<Account<'info, SwapInfo>>,
    /// The authority of the user.
    pub user_authority: Signer<'info>,
}

/// Token accounts for a 'swap' instruction.
#[derive(Accounts)]
pub struct SwapToken<'info> {
    /// The token account associated with the user.
    #[account(mut)]
    pub user: Box<Account<'info, TokenAccount>>,
    /// The token account for the pool's reserves of this token.
    #[account(mut)]
    pub reserve: Box<Account<'info, TokenAccount>>,
}

/// Token accounts for the destination of a swap instruction.
#[derive(Accounts)]
pub struct SwapTokenWithFees<'info> {
    /// TODO: init <> transfer instruction from user
    /// The token account associated with the user.
    #[account(mut)]
    pub user: Box<Account<'info, TokenAccount>>,
    /// The taken account for the pool's reserves of this token.
    #[account(mut)]
    pub reserve: Box<Account<'info, TokenAccount>>,
    /// The token account for the fees associated with the token.
    #[account(mut)]
    pub fees: Box<Account<'info, TokenAccount>>,
}
