import { buildCoderMap, newProgramMap } from "@saberhq/anchor-contrib";
import type { AugmentedProvider, Provider } from "@saberhq/solana-contrib";
import { SolanaAugmentedProvider } from "@saberhq/solana-contrib";
import type { TokenAmount } from "@saberhq/token-utils";
import type { PublicKey, Signer } from "@solana/web3.js";

import { DEFAULT_FACTORY, PROGRAM_ADDRESSES } from "./constants";
import type { CpAmmProgram } from "./programs/cpAmm";
import { CpammJSON } from "./programs/cpAmm";
import type { ActionPlan, Trade } from "./router";
import { Router } from "./router";
import { SenchaFactory } from "./wrappers/cp-amm/factory";

/**
 * Program IDLs.
 */
export const IDLS = {
  CpAmm: CpammJSON,
};

export interface Programs {
  CpAmm: CpAmmProgram;
}

/**
 * Sencha coders.
 */
export const SENCHA_CODERS = buildCoderMap(IDLS, PROGRAM_ADDRESSES);

/**
 * Sencha SDK.
 */
export class SenchaSDK {
  readonly router: Router;

  constructor(
    readonly provider: AugmentedProvider,
    readonly programs: Programs
  ) {
    this.router = new Router(provider, programs);
  }

  /**
   * Loads a Factory wrapper.
   * @param factory The factory to load.
   * @returns
   */
  loadFactory(factory: PublicKey = DEFAULT_FACTORY): SenchaFactory {
    return new SenchaFactory(this, factory);
  }

  /**
   * Creates a new instance of the SDK with the given keypair.
   */
  withSigner(signer: Signer): SenchaSDK {
    return SenchaSDK.load({
      provider: this.provider.withSigner(signer),
      addresses: PROGRAM_ADDRESSES,
    });
  }

  planTrade(trade: Trade, minimumAmountOut: TokenAmount): ActionPlan {
    return this.router.planTrade(trade, minimumAmountOut);
  }

  /**
   * Loads the SDK.
   * @returns
   */
  static load({
    provider,
    addresses = PROGRAM_ADDRESSES,
  }: {
    // Provider
    provider: Provider;
    // Addresses of each program.
    addresses?: { [K in keyof Programs]?: PublicKey };
  }): SenchaSDK {
    const augProvider = new SolanaAugmentedProvider(provider);
    const allAddresses = { ...PROGRAM_ADDRESSES, ...addresses };
    const programs = newProgramMap<Programs>(provider, IDLS, allAddresses);
    return new SenchaSDK(augProvider, programs);
  }
}
