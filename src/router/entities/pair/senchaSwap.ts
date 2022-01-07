import type { Percent } from "@saberhq/token-utils";
import { Price, TokenAmount } from "@saberhq/token-utils";
import type { PublicKey } from "@solana/web3.js";
import JSBI from "jsbi";

import type { CpAmmWrapper } from "../../..";
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

const ZERO = JSBI.BigInt(0);

// TODO: add cp-amm calculation methods to sencha-sdk
const poolStrategy: PoolStrategy<CpAmmPool> = {
  getOutputAmount: ({ exchange, ...rest }, inputAmount) => {
    const [reserveA, reserveB] = exchange.reserves;

    const [fromReserves, toReserves] = inputAmount.token.equals(
      exchange.reserves[0].amount.token
    )
      ? [exchange.reserves[0], exchange.reserves[1]]
      : [exchange.reserves[1], exchange.reserves[0]];

    const exchangeFees = exchange.fees;

    if (fromReserves.amount.equalTo(ZERO) || toReserves.amount.equalTo(ZERO)) {
      // TODO: typed errors
      throw new Error("insufficient reserves");
    }

    const n = JSBI.multiply(toReserves.amount.raw, inputAmount.raw);
    const d = JSBI.add(fromReserves.amount.raw, inputAmount.raw);

    const out = JSBI.divide(n, d);
    const outputAmountWithoutFees = new TokenAmount(
      toReserves.amount.token,
      out
    );

    if (JSBI.equal(outputAmountWithoutFees.raw, ZERO)) {
      throw new Error("insufficient pool liquidity");
    }

    // Note that it is may be ideal for fees to be charged on the known user-specified amount
    // so that it is easier to derive stats without greater access to historical chain data
    const outFees = JSBI.BigInt(
      exchangeFees.trade.asFraction.multiply(out).toFixed(0)
    );
    const outFeesAmount = new TokenAmount(toReserves.amount.token, outFees);
    const outputAmount = outputAmountWithoutFees.subtract(outFeesAmount);

    return {
      amount: outputAmount,
      fees: outFeesAmount,
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
