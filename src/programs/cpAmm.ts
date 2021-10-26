import type { AnchorTypes } from "@saberhq/anchor-contrib";

import type { CpammIDL } from ".";

export * from "../idls/cpamm";

export type CpAmm = AnchorTypes<
  CpammIDL,
  {
    factory: FactoryData;
    swapInfo: SwapInfoData;
    swapMeta: SwapMetaData;
  },
  {
    SwapTokenInfo: SwapTokenInfo;
    SwapFees: CpSwapFees;
    SwapCumulativeStats: SwapCumulativeStats;
    SwapPriceInfo: SwapPriceInfo;
  }
>;

type Accounts = CpAmm["Accounts"];
export type SwapInfoData = Accounts["SwapInfo"];
export type FactoryData = Accounts["Factory"];
export type SwapMetaData = Accounts["SwapMeta"];

type AnchorDefinedTypes = CpAmm["Defined"];
export type SwapTokenInfo = AnchorDefinedTypes["SwapTokenInfo"];
export type CpSwapFees = AnchorDefinedTypes["SwapFees"];
export type SwapCumulativeStats = AnchorDefinedTypes["SwapCumulativeStats"];
export type SwapCumulativeTokenStats =
  AnchorDefinedTypes["SwapCumulativeTokenStats"];
export type SwapPriceInfo = AnchorDefinedTypes["SwapPriceInfo"];

export type CpAmmError = CpAmm["Error"];
export type CpAmmEvents = CpAmm["Events"];
export type CpAmmProgram = CpAmm["Program"];
