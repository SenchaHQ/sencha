import { TokenAmount, ZERO } from "@saberhq/token-utils";
import JSBI from "jsbi";

import type { IExchangeInfo } from "..";

export const calculateEstimatedSwapOutputAmount = (
  exchange: IExchangeInfo,
  inputAmount: TokenAmount
): {
  [K in
    | "outputAmountBeforeFees"
    | "outputAmount"
    | "tradeFee"
    | "lpFee"
    | "adminFee"]: TokenAmount;
} => {
  const [fromReserves, toReserves] = inputAmount.token.equals(
    exchange.reserves[0].amount.token
  )
    ? [exchange.reserves[0], exchange.reserves[1]]
    : [exchange.reserves[1], exchange.reserves[0]];

  // TODO: fix upstream (parseBigintIsh)
  // https://github.com/GoogleChromeLabs/jsbi/compare/85d3d1656f8255486befae89d979b8dce612e900...b1b384155d30418078fe63faa93596f5948fbb9b#diff-9eedabcdf3d697813b37cc3b568bf4f09d32ad65829d2bd799c6353f375d1d3fR76
  if (fromReserves.amount.equalTo("0") || toReserves.amount.equalTo("0")) {
    // TODO: typed errors
    throw new Error("insufficient reserves");
  }

  const n = JSBI.multiply(toReserves.amount.raw, inputAmount.raw);
  const d = JSBI.add(fromReserves.amount.raw, inputAmount.raw);

  const outputBeforeFees = JSBI.divide(n, d);
  const outputAmountBeforeFees = new TokenAmount(
    toReserves.amount.token,
    outputBeforeFees
  );

  if (JSBI.equal(outputAmountBeforeFees.raw, ZERO)) {
    throw new Error("insufficient pool liquidity");
  }

  // Note that it is may be ideal for fees to be charged on the known user-specified amount
  // so that it is easier to derive stats without greater access to historical chain data
  const tradeFeeAmount = new TokenAmount(
    toReserves.amount.token,
    exchange.fees.trade.asFraction.multiply(outputBeforeFees).toFixed(0)
  );

  const adminFeeAmount = new TokenAmount(
    toReserves.amount.token,
    exchange.fees.adminTrade.asFraction.multiply(tradeFeeAmount.raw).toFixed(0)
  );

  const lpFeeAmount = tradeFeeAmount.subtract(adminFeeAmount);

  const outputAmount = outputAmountBeforeFees.subtract(tradeFeeAmount);

  return {
    outputAmountBeforeFees,
    outputAmount,
    tradeFee: tradeFeeAmount,
    lpFee: lpFeeAmount,
    adminFee: adminFeeAmount,
  };
};
