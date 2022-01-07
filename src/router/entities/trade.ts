import type { Token } from "@saberhq/token-utils";
import {
  Fraction,
  ONE,
  Percent,
  Price,
  TokenAmount,
} from "@saberhq/token-utils";
import invariant from "tiny-invariant";

import { sortedInsert } from "../utils/sortedInsert";
import type { AnyPair } from "./pair";
import { Route } from "./route";

/**
 * Returns the percent difference between the mid price and the execution price, i.e. price impact.
 * @param midPrice mid price before the trade
 * @param inputAmount the input amount of the trade
 * @param outputAmount the output amount of the trade
 */
function computePriceImpact(
  midPrice: Price,
  inputAmount: TokenAmount,
  outputAmount: TokenAmount
): Percent {
  const exactQuote = midPrice.quote(inputAmount);
  // calculate slippage := (exactQuote - outputAmount) / exactQuote
  const slippage = exactQuote.subtract(outputAmount).divide(exactQuote);
  return new Percent(slippage.numerator, slippage.denominator);
}

// minimal interface so the input output comparator may be shared across types
interface InputOutput {
  readonly inputAmount: TokenAmount;
  readonly outputAmount: TokenAmount;
}

// comparator function that allows sorting trades by their output amounts, in decreasing order, and then input amounts
// in increasing order. i.e. the best trades have the most outputs for the least inputs and are sorted first
export function inputOutputComparator(a: InputOutput, b: InputOutput): number {
  // must have same input and output token for comparison
  invariant(a.inputAmount.token.equals(b.inputAmount.token), "INPUT_CURRENCY");
  invariant(
    a.outputAmount.token.equals(b.outputAmount.token),
    "OUTPUT_CURRENCY"
  );
  if (a.outputAmount.equalTo(b.outputAmount)) {
    if (a.inputAmount.equalTo(b.inputAmount)) {
      return 0;
    }
    // trade A requires less input than trade B, so A should come first
    if (a.inputAmount.lessThan(b.inputAmount)) {
      return -1;
    } else {
      return 1;
    }
  } else {
    // tradeA has less output than trade B, so should come second
    if (a.outputAmount.lessThan(b.outputAmount)) {
      return 1;
    } else {
      return -1;
    }
  }
}

// extension of the input output comparator that also considers other dimensions of the trade in ranking them
export function tradeComparator(a: Trade, b: Trade): number {
  const ioComp = inputOutputComparator(a, b);
  if (ioComp !== 0) {
    return ioComp;
  }

  // consider lowest slippage next, since these are less likely to fail
  if (a.priceImpact.lessThan(b.priceImpact)) {
    return -1;
  } else if (a.priceImpact.greaterThan(b.priceImpact)) {
    return 1;
  }

  // finally consider the number of hops since each hop costs gas
  return a.route.path.length - b.route.path.length;
}

export interface BestTradeOptions {
  // how many results to return
  maxNumResults?: number;
  // the maximum number of hops a trade should contain
  maxHops?: number;
}

/**
 * Represents a trade executed against a list of pairs.
 * Does not account for slippage, i.e. trades that front run this trade and move the price.
 */
export class Trade {
  /**
   * The route of the trade, i.e. which pairs the trade goes through.
   */
  readonly route: Route;
  /**
   * The input amount for the trade assuming no slippage.
   */
  readonly inputAmount: TokenAmount;
  /**
   * The output amount for the trade assuming no slippage.
   */
  readonly outputAmount: TokenAmount;
  /**
   * The price expressed in terms of output amount/input amount.
   */
  readonly executionPrice: Price;
  /**
   * The mid price after the trade executes assuming no slippage.
   */
  readonly nextMidPrice: Price;
  /**
   * The percent difference between the mid price before the trade and the trade execution price.
   */
  readonly priceImpact: Percent;
  /**
   * Fees paid to the pairs.
   */
  readonly fees: readonly TokenAmount[];

  /**
   * Constructs an exact in trade with the given amount in and route
   * @param route route of the exact in trade
   * @param amountIn the amount being passed in
   */
  static exactIn(route: Route, amountIn: TokenAmount): Trade {
    return new Trade(route, amountIn);
  }

  constructor(route: Route, amount: TokenAmount) {
    const amounts: TokenAmount[] = new Array(
      route.path.length
    ) as TokenAmount[];
    const fees: TokenAmount[] = new Array(route.path.length) as TokenAmount[];
    const nextPairs: AnyPair[] = new Array(route.pairs.length) as AnyPair[];
    invariant(amount.token.equals(route.input), "INPUT");
    amounts[0] = amount;
    for (let i = 0; i < route.path.length - 1; i++) {
      const pair = route.pairs[i];
      const amount = amounts[i];
      invariant(pair, "PAIR");
      invariant(amount, "AMOUNT");
      const {
        amount: outputAmount,
        fees: pairFee,
        pair: nextPair,
      } = pair.getOutputAmount(amount);
      amounts[i + 1] = outputAmount;
      fees[i] = pairFee;
      nextPairs[i] = nextPair;
    }

    this.route = route;
    this.inputAmount = amount;
    const lastOutput = amounts[amounts.length - 1];
    invariant(lastOutput, "LAST_OUTPUT");
    this.outputAmount = lastOutput;
    this.executionPrice = new Price(
      this.inputAmount.token,
      this.outputAmount.token,
      this.inputAmount.raw.toString(),
      this.outputAmount.raw.toString()
    );
    this.nextMidPrice = new Route(
      nextPairs,
      route.input,
      route.output
    ).midPrice;
    this.priceImpact = computePriceImpact(
      route.midPrice,
      this.inputAmount,
      this.outputAmount
    );
    this.fees = fees;
  }

  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance tolerance of unfavorable slippage from the execution price of this trade
   */
  minimumAmountOut(slippageTolerance: Percent): TokenAmount {
    // TODO: fix upstream (parseBigintIsh)
    // https://github.com/GoogleChromeLabs/jsbi/compare/85d3d1656f8255486befae89d979b8dce612e900...b1b384155d30418078fe63faa93596f5948fbb9b#diff-9eedabcdf3d697813b37cc3b568bf4f09d32ad65829d2bd799c6353f375d1d3fR76
    invariant(!slippageTolerance.lessThan("0"), "SLIPPAGE_TOLERANCE");

    const slippageAdjustedAmountOut = new Fraction(ONE)
      .add(slippageTolerance)
      .invert()
      .multiply(this.outputAmount.raw).quotient;
    return new TokenAmount(this.outputAmount.token, slippageAdjustedAmountOut);
  }

  /**
   * Given a list of pairs, and a fixed amount in, returns the top `maxNumResults` trades that go from an input token
   * amount to an output token, making at most `maxHops` hops.
   * Note this does not consider aggregation, as routes are linear. It's possible a better route exists by splitting
   * the amount in among multiple routes.
   * @param pairs the pairs to consider in finding the best trade
   * @param tokenAmountIn exact amount of the input token to spend
   * @param tokenOut the desired token out
   * @param maxNumResults maximum number of results to return
   * @param maxHops maximum number of hops a returned trade can make, e.g. 1 hop goes through a single pair
   * @param currentPairs used in recursion; the current list of pairs
   * @param originalAmountIn used in recursion; the original value of the tokenAmountIn parameter
   * @param bestTrades used in recursion; the current list of best trades
   */
  static bestTradeExactIn(
    pairs: AnyPair[],
    tokenAmountIn: TokenAmount,
    tokenOut: Token,
    { maxNumResults = 3, maxHops = 3 }: BestTradeOptions = {},
    // used in recursion.
    currentPairs: AnyPair[] = [],
    nextAmountIn: TokenAmount = tokenAmountIn,
    bestTrades: Trade[] = []
  ): Trade[] {
    invariant(pairs.length > 0, "PAIRS");
    invariant(maxHops > 0, "MAX_HOPS");
    invariant(
      tokenAmountIn === nextAmountIn || currentPairs.length > 0,
      "INVALID_RECURSION"
    );

    const amountIn = nextAmountIn;
    // let logs = [];
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      // pair irrelevant
      invariant(pair, "PAIR");
      if (
        !pair.token0.equals(amountIn.token) &&
        !pair.token1.equals(amountIn.token)
      ) {
        continue;
      }
      if (pair.hasZeroLiquidity()) {
        console.debug(`Pair has no liquidity`, pair);
        continue;
      }

      let amountOut: TokenAmount;
      try {
        const result = pair.getOutputAmount(amountIn);
        amountOut = result.amount;
        console.debug("outputamount", amountOut);
      } catch (error) {
        console.debug("insufficient output", error, pair);

        // input too low
        if (
          error instanceof Error &&
          error.message === "insufficient input amount"
        ) {
          continue;
        }
        throw error;
      }

      // we have arrived at the output token, so this is the final trade of one of the paths
      if (amountOut.token.equals(tokenOut)) {
        sortedInsert(
          bestTrades,
          new Trade(
            new Route([...currentPairs, pair], tokenAmountIn.token, tokenOut),
            tokenAmountIn
          ),
          maxNumResults,
          tradeComparator
        );
      } else if (maxHops > 1 && pairs.length > 1) {
        const pairsExcludingThisPair = pairs
          .slice(0, i)
          .concat(pairs.slice(i + 1, pairs.length));

        // otherwise, consider all the other paths that lead from this token as long as we have not exceeded maxHops
        Trade.bestTradeExactIn(
          pairsExcludingThisPair,
          tokenAmountIn,
          tokenOut,
          {
            maxNumResults,
            maxHops: maxHops - 1,
          },
          [...currentPairs, pair],
          amountOut,
          bestTrades
        );
      }
    }

    return bestTrades;
  }

  // /**
  //  * similar to the above method but instead targets a fixed output amount
  //  * given a list of pools, and a fixed amount out, returns the top `maxNumResults` trades that go from an input token
  //  * to an output token amount, making at most `maxHops` hops
  //  * note this does not consider aggregation, as routes are linear. it's possible a better route exists by splitting
  //  * the amount in among multiple routes.
  //  * @param pools the pools to consider in finding the best trade
  //  * @param currencyIn the currency to spend
  //  * @param currencyAmountOut the desired currency amount out
  //  * @param nextAmountOut the exact amount of currency out
  //  * @param maxNumResults maximum number of results to return
  //  * @param maxHops maximum number of hops a returned trade can make, e.g. 1 hop goes through a single pool
  //  * @param currentPools used in recursion; the current list of pools
  //  * @param bestTrades used in recursion; the current list of best trades
  //  * @returns The exact out trade
  //  */
  // public static async bestTradeExactOut(
  //   pairs: AnyPair[],
  //   tokenIn: Token,
  //   tokenAmountOut: TokenAmount,
  //   { maxNumResults = 3, maxHops = 3 }: BestTradeOptions = {},
  //   // used in recursion.
  //   currentPairs: AnyPair[] = [],
  //   nextAmountOut: TokenAmount = tokenAmountOut,
  //   bestTrades: Trade[] = []
  // ): Trade[]> {
  //   invariant(pairs.length > 0, "POOLS");
  //   invariant(maxHops > 0, "MAX_HOPS");
  //   invariant(
  //     tokenAmountIn === nextAmountOut || currentPairs.length > 0,
  //     "INVALID_RECURSION"
  //   );

  //   const amountOut = nextAmountOut.wrapped;
  //   const tokenIn = currencyIn.wrapped;
  //   for (let i = 0; i < pairs.length; i++) {
  //     const pool = pools[i];
  //     // pool irrelevant
  //     if (
  //       !pool.token0.equals(amountOut.currency) &&
  //       !pool.token1.equals(amountOut.currency)
  //     )
  //       continue;

  //     let amountIn: CurrencyAmount<Token>;
  //     try {
  //       [amountIn] = await pool.getInputAmount(amountOut);
  //     } catch (error) {
  //       // not enough liquidity in this pool
  //       if (error.isInsufficientReservesError) {
  //         continue;
  //       }
  //       throw error;
  //     }
  //     // we have arrived at the input token, so this is the first trade of one of the paths
  //     if (amountIn.currency.equals(tokenIn)) {
  //       sortedInsert(
  //         bestTrades,
  //         await Trade.fromRoute(
  //           new Route(
  //             [pool, ...currentPools],
  //             currencyIn,
  //             currencyAmountOut.currency
  //           ),
  //           currencyAmountOut,
  //           TradeType.EXACT_OUTPUT
  //         ),
  //         maxNumResults,
  //         tradeComparator
  //       );
  //     } else if (maxHops > 1 && pools.length > 1) {
  //       const poolsExcludingThisPool = pools
  //         .slice(0, i)
  //         .concat(pools.slice(i + 1, pools.length));

  //       // otherwise, consider all the other paths that arrive at this token as long as we have not exceeded maxHops
  //       await Trade.bestTradeExactOut(
  //         poolsExcludingThisPool,
  //         currencyIn,
  //         currencyAmountOut,
  //         {
  //           maxNumResults,
  //           maxHops: maxHops - 1,
  //         },
  //         [pool, ...currentPools],
  //         amountIn,
  //         bestTrades
  //       );
  //     }
  //   }

  //   return bestTrades;
  // }

  /**
   * Return the execution price after accounting for slippage tolerance
   * @param slippageTolerance the allowed tolerated slippage
   */
  worstExecutionPrice(slippageTolerance: Percent): Price {
    const minOut = this.minimumAmountOut(slippageTolerance);
    return new Price(
      this.inputAmount.token,
      this.outputAmount.token,
      this.inputAmount.raw,
      minOut.raw
    );
  }
}
