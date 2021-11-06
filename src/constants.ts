import { Percent, u64 } from "@saberhq/token-utils";
import { PublicKey } from "@solana/web3.js";

import type { Fees } from "./wrappers/cp-amm/types";

export const LOCAL_CHAIN_ID = 100;

export const DEFAULT_DECIMALS = 6;
export const DEFAULT_HARD_CAP = new u64("10000000000000000"); // 10 billion

// maps to base: SENfrUReUHhi9sM4uLqiZvWBSBTYjJDrpK1Grvsg6Tr
export const DEFAULT_FACTORY = new PublicKey(
  "DtXfMx19KqLfUWJGPMdkjxfbzQ4PrHyBQhA7vgQ2oRzG"
);

export const PROGRAM_ADDRESSES = {
  CpAmm: new PublicKey("SCHAtsf8mbjyjiv4LkhLKutTf6JnZAbdJKFkXQNMFHZ"),
} as const;

export const DEFAULT_FEES: Fees = {
  trade: new Percent(30, 10_000),
  withdraw: new Percent(0, 10_000),
  adminTrade: new Percent(1_600, 10_000),
  adminWithdraw: new Percent(0, 10_000),
};
