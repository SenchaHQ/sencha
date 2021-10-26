import type { Price, Token, TokenAmount } from "@saberhq/token-utils";

import type { Action } from "../../wrappers/actionPlan";
import type { Pair } from ".";

/**
 * Result of a pool strategy.
 */
export interface PoolOutputResult<P> {
  /**
   * Amount out.
   */
  amount: TokenAmount;

  /**
   * Fees paid.
   */
  fees: TokenAmount;

  /**
   * The new Pair state.
   */
  pair: Pair<P>;
}

/**
 * Strategy of a pool's LP.
 */
export interface PoolStrategy<P> {
  /**
   * How many tokens will be output for the given input, and the new pair.
   */
  getOutputAmount: (pool: P, inputAmount: TokenAmount) => PoolOutputResult<P>;

  // getInputAmount?: (pool: P, outputAmount: TokenAmount) => PoolOutputResult<P>;

  /**
   * Gets token 0 of a pool. Arbitrary.
   */
  getToken0: (pool: P) => Token;

  /**
   * Gets token 1 of a pool. Arbitrary.
   */
  getToken1: (pool: P) => Token;

  /**
   * Price of token 1 relative to token 0.
   */
  getPriceOfToken1: (pool: P) => Price;

  /**
   * Returns true if the provided pool has zero liquidity and thus cannot trade.
   */
  hasZeroLiquidity: (pool: P) => boolean;

  /**
   * Converts this pool to an action.
   */
  asAction: (pool: P, outputToken: Token) => Action;
}
