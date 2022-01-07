import type { Percent, TokenAmount } from "@saberhq/token-utils";
import { Price, ZERO } from "@saberhq/token-utils";
import type { PublicKey } from "@solana/web3.js";
import invariant from "tiny-invariant";

import type { CpAmmWrapper } from "../../..";
import { calculateEstimatedSwapOutputAmount } from "../../../calculator/amounts";
import type { PoolStrategy } from ".";
import { Pair } from ".";

export interface IExchangeInfo {
  fees: CpAmmFees;
  lpTotalSupply: TokenAmount;
  reserves: readonly [IReserve, IReserve];
}

export type CpAmmFees = {
  trade: Percent;
  withdraw: Percent;
  adminTrade: Percent;
  adminWithdraw: Percent;
};

export interface IReserve {
  /**
   * Swap account holding the reserve tokens
   */
  reserveAccount: PublicKey;
  /**
   * Destination account of admin fees of this reserve token
   */
  adminFeeAccount: PublicKey;
  /**
   * Amount of tokens in the reserve
   */
  amount: TokenAmount;
}

export interface CpAmmPool {
  swap: CpAmmWrapper;
  exchange: IExchangeInfo;
}

// TODO: add cp-amm calculation methods to sencha-sdk
const poolStrategy: PoolStrategy<CpAmmPool> = {
  getOutputAmount: ({ exchange, ...rest }, inputAmount) => {
    const [reserveA, reserveB] = exchange.reserves;
    const { outputAmount, tradeFee } = calculateEstimatedSwapOutputAmount(
      exchange,
      inputAmount
    );

    invariant(!outputAmount.equalTo(ZERO), "POOL_ZERO_LIQUIDITY");

    return {
      amount: outputAmount,
      fees: tradeFee,
      pair: pairFromSenchaSwap({
        ...rest,
        exchange: {
          ...exchange,
          reserves: inputAmount.token.equals(reserveA.amount.token)
            ? [
                {
                  ...reserveA,
                  amount: reserveA.amount.add(inputAmount),
                },
                {
                  ...reserveB,
                  amount: reserveB.amount.subtract(outputAmount),
                },
              ]
            : [
                {
                  ...reserveA,
                  amount: reserveA.amount.subtract(outputAmount),
                },
                {
                  ...reserveB,
                  amount: reserveB.amount.add(inputAmount),
                },
              ],
        },
      }),
    };
  },

  getPriceOfToken1: ({ exchange }) => {
    const [reserveA, reserveB] = exchange.reserves;

    return new Price(
      reserveB.amount.token,
      reserveA.amount.token,
      reserveB.amount.raw,
      reserveA.amount.raw
    );
  },
  hasZeroLiquidity: ({ exchange }) => {
    return (
      exchange.reserves[0].amount.equalTo(0) ||
      exchange.reserves[1].amount.equalTo(0)
    );
  },

  getToken0: ({ exchange }) => exchange.reserves[0].amount.token,
  getToken1: ({ exchange }) => exchange.reserves[1].amount.token,

  asAction: (pool, outputToken) => ({
    swap: pool.swap,
    action: "mfSwap",
    outputToken,
  }),
};

export const pairFromSenchaSwap = (pool: CpAmmPool): Pair<CpAmmPool> => {
  return new Pair(pool, poolStrategy);
};
