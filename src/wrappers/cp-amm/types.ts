import type { TransactionEnvelope } from "@saberhq/solana-contrib";
import type { Percent } from "@saberhq/token-utils";
import type { PublicKey } from "@solana/web3.js";

import type { SwapInfoData } from "../../programs/cpAmm";

export type Fees = {
  trade: Percent;
  withdraw: Percent;
  adminTrade: Percent;
  adminWithdraw: Percent;
};

export type PendingSwap = {
  poolMint: PublicKey;
  swap: PublicKey;
  initAccountsTX: TransactionEnvelope;
  initSwapTX: TransactionEnvelope;
  // tokenA: SwapTokenInfo;
  // tokenB: SwapTokenInfo;
};

export interface CpAmmState extends Omit<SwapInfoData, "fees"> {
  /**
   * Fee schedule
   */
  fees: Fees;
}
