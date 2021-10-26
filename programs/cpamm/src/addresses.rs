//! Contains addresses used for the CP-AMM program.
//! These addresses are updated via program upgrades.

use anchor_lang::prelude::*;

/// Wrapper module.
pub mod admin_account {
    use anchor_lang::declare_id;

    declare_id!("2rgQZrNmFkn7TvKbZuuMXjtDZ5YVagx9oqyTi5H3Dr2a");
}

/// Account authorized to manage swaps.
pub static ADMIN_ACCOUNT: Pubkey = admin_account::ID;
