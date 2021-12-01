use crate::{
    Deposit, InitSwapToken, NewFactory, NewSwap, NewSwapMeta, Swap, SwapToken, SwapTokenInfo,
    SwapTokenWithFees, SwapUserContext, Withdraw,
};
use anchor_lang::{prelude::*, Key};
use vipers::validate::Validate;
use vipers::{assert_ata, assert_keys_eq, assert_keys_neq, invariant};

// --------------------------------
// Instruction account structs
// --------------------------------

impl<'info> Validate<'info> for NewFactory<'info> {
    fn validate(&self) -> ProgramResult {
        Ok(())
    }
}

impl<'info> Validate<'info> for NewSwap<'info> {
    fn validate(&self) -> ProgramResult {
        let pool_mint_decimals = self.token_0.mint.decimals.max(self.token_1.mint.decimals);

        // pool mint belongs to swap
        invariant!(
            self.pool_mint.decimals == pool_mint_decimals,
            "pool mint decimals must be the max of token A and token B mint"
        );
        assert_keys_eq!(
            self.pool_mint.mint_authority.unwrap(),
            self.swap,
            "pool_mint.mint_authority"
        );
        assert_keys_eq!(
            self.pool_mint.freeze_authority.unwrap(),
            self.swap,
            "pool_mint.freeze_authority"
        );
        require!(self.pool_mint.supply == 0, SwapPoolMintSupply);

        // output_lp
        assert_keys_eq!(self.output_lp.mint, self.pool_mint, "output_lp.mint",);

        let token_0_mint = &self.token_0.mint;
        let token_1_mint = &self.token_1.mint;
        require!(
            token_0_mint.key() != token_1_mint.key(),
            SwapTokensCannotBeEqual
        );
        require!(token_0_mint.key() < token_1_mint.key(), SwapTokensNotSorted);

        let swap_key = self.swap.key();
        self.token_0.validate_for_swap(swap_key)?;
        self.token_1.validate_for_swap(swap_key)?;

        Ok(())
    }
}

impl<'info> Validate<'info> for NewSwapMeta<'info> {
    fn validate(&self) -> ProgramResult {
        // nothing to validate
        Ok(())
    }
}

impl<'info> Validate<'info> for SwapUserContext<'info> {
    fn validate(&self) -> ProgramResult {
        // ensure no self-dealing
        assert_keys_neq!(self.user_authority, self.swap);
        require!(!self.swap.is_paused, Paused);
        Ok(())
    }
}

impl<'info> Validate<'info> for Swap<'info> {
    fn validate(&self) -> ProgramResult {
        self.user.validate()?;

        // inner validation will ensure that token source mint equals respective reserve
        let (swap_input, swap_output) =
            if self.input.reserve.key() == self.user.swap.token_0.reserves {
                (&self.user.swap.token_0, &self.user.swap.token_1)
            } else {
                (&self.user.swap.token_1, &self.user.swap.token_0)
            };

        assert_keys_eq!(
            self.output.user.owner,
            self.user.user_authority,
            "output.user.owner must be user.user_authority"
        );

        self.input.validate_for_swap(swap_input)?;
        self.output.validate_for_swap(swap_output)?;

        Ok(())
    }
}

impl<'info> Validate<'info> for Withdraw<'info> {
    fn validate(&self) -> ProgramResult {
        self.user.validate()?;

        assert_keys_eq!(self.pool_mint, self.user.swap.pool_mint, "pool_mint");
        assert_keys_eq!(self.input_lp.mint, self.pool_mint, "input_lp.mint");

        self.output_0.validate_for_swap(&self.user.swap.token_0)?;
        self.output_1.validate_for_swap(&self.user.swap.token_1)?;

        Ok(())
    }
}

impl<'info> Validate<'info> for Deposit<'info> {
    fn validate(&self) -> ProgramResult {
        self.user.validate()?;

        // input_a, input_b should check their equal mints
        self.input_0.validate_for_swap(&self.user.swap.token_0)?;
        self.input_1.validate_for_swap(&self.user.swap.token_1)?;

        // should be same as swap
        assert_keys_eq!(self.pool_mint, self.user.swap.pool_mint, "pool_mint");

        // lp output destination
        assert_keys_eq!(
            self.output_lp.mint,
            self.user.swap.pool_mint,
            "output_lp.mint"
        );
        assert_keys_neq!(
            self.output_lp.owner,
            self.user.swap,
            "output_lp.owner should not be the swap"
        );

        Ok(())
    }
}

// --------------------------------
// Account Structs
// --------------------------------

impl<'info> InitSwapToken<'info> {
    /// Validate the init swap.
    fn validate_for_swap(&self, swap: Pubkey) -> ProgramResult {
        // We could check token freeze authority presence
        // This ensures the swap will always be functional, since a freeze
        // would prevent the swap from working.
        // We do not think this is necessary to add.

        assert_keys_eq!(self.fees.mint, self.mint, "fees.mint");
        assert_keys_eq!(self.fees.owner, swap, "fees.owner");
        assert_ata!(*self.reserve, swap, *self.mint, "reserve");

        // ensure the fee and reserve accounts are different
        // otherwise protocol fees would accrue to the LP holders
        assert_keys_neq!(self.fees, self.reserve, "fees cannot equal reserve");
        Ok(())
    }
}

impl<'info> SwapToken<'info> {
    fn validate_for_swap(&self, swap_info: &SwapTokenInfo) -> ProgramResult {
        assert_keys_eq!(self.reserve, swap_info.reserves, "reserve");
        assert_keys_eq!(self.user.mint, swap_info.mint, "user.mint");

        // ensure no self-dealing
        assert_keys_neq!(self.reserve, self.user, "user cannot be reserve account");

        Ok(())
    }
}

impl<'info> SwapTokenWithFees<'info> {
    fn validate_for_swap(&self, swap_info: &SwapTokenInfo) -> ProgramResult {
        assert_keys_eq!(self.fees, swap_info.admin_fees, "fees");
        assert_keys_eq!(self.reserve, swap_info.reserves, "reserve");
        assert_keys_eq!(self.user.mint, swap_info.mint, "user.mint");

        // ensure no self-dealing
        assert_keys_neq!(self.fees, self.user, "user cannot be fees account");
        assert_keys_neq!(self.reserve, self.user, "user cannot be reserve account");
        Ok(())
    }
}
