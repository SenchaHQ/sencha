import { Percent } from "@saberhq/token-utils";

import type { CpSwapFees } from "../../programs/cpAmm";
import type { Fees } from "./types";

export const KBPS_PER_WHOLE = 10_000_000;

export const decodeFees = (fees: CpSwapFees): Fees => ({
  trade: new Percent(fees.tradeFeeKbps, KBPS_PER_WHOLE),
  withdraw: new Percent(fees.withdrawFeeKbps, KBPS_PER_WHOLE),
  adminTrade: new Percent(fees.adminTradeFeeKbps, KBPS_PER_WHOLE),
  adminWithdraw: new Percent(fees.adminWithdrawFeeKbps, KBPS_PER_WHOLE),
});
