import { Percent, u64 } from "@saberhq/token-utils";
import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";

import type { Fees } from "./wrappers/cp-amm/types";

export const LOCAL_CHAIN_ID = 100;

export const DEFAULT_DECIMALS = 6;
export const DEFAULT_HARD_CAP = new u64("10000000000000000"); // 10 billion

export const SECONDS_PER_DAY = new u64(24 * 60 * 60);
export const SECONDS_PER_YEAR = new u64(365).mul(SECONDS_PER_DAY);

export const ZERO = new BN(0);
export const ONE = new BN(1);
export const MAX_U64 = new BN("9223372036854775807");
export const BASE_TEN = new BN(10);

// maps to base: FACAsM42zGSQ9KomGRYgNspE7oFcn2gDFVJbWnz5DY8m
export const DEFAULT_FACTORY = new PublicKey(
  "Fyg2SgUDLzhZkMpG5var8Zrgh6XEFpAPLRJNtvJHHDr6"
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
