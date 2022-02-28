import { BorshCoder } from "@project-serum/anchor";
import type { KeyedAccountInfo } from "@solana/web3.js";

import type {
  FactoryData,
  SwapInfoData,
  SwapMetaData,
} from "../../programs/cpAmm";
import { CpammJSON } from "../../programs/cpAmm";

export type AccountParser<T> = (d: KeyedAccountInfo) => T;

export const SENCHA_CPAMM_CODER = new BorshCoder(CpammJSON);

export const PARSE_SWAP_INFO: AccountParser<SwapInfoData> = (
  d: KeyedAccountInfo
) =>
  SENCHA_CPAMM_CODER.accounts.decode<SwapInfoData>(
    "SwapInfo",
    d.accountInfo.data
  );

export const parseSwapMetaData = (data: Buffer): SwapMetaData =>
  SENCHA_CPAMM_CODER.accounts.decode<SwapMetaData>("SwapMeta", data);

export const PARSE_SWAP_META: AccountParser<SwapMetaData> = (
  d: KeyedAccountInfo
) => parseSwapMetaData(d.accountInfo.data);

export const PARSE_FACTORY: AccountParser<FactoryData> = (
  d: KeyedAccountInfo
) =>
  SENCHA_CPAMM_CODER.accounts.decode<FactoryData>(
    "Factory",
    d.accountInfo.data
  );
