/// Generates [crate::state::SwapInfo] signer seeds,
macro_rules! gen_swap_signer_seeds {
    ($swap:expr) => {
        &[
            b"SwapInfo" as &[u8],
            &$swap.factory.to_bytes(),
            &$swap.token_0.mint.to_bytes(),
            &$swap.token_1.mint.to_bytes(),
            &[$swap.bump],
        ]
    };
}
