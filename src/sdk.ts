import type { Address } from "@project-serum/anchor";
import { Program, Provider as AnchorProvider } from "@project-serum/anchor";
import type { Provider } from "@saberhq/solana-contrib";
import { SignerWallet, SolanaProvider } from "@saberhq/solana-contrib";
import type { TokenAmount } from "@saberhq/token-utils";
import type { PublicKey, Signer } from "@solana/web3.js";
import mapValues from "lodash.mapvalues";
import invariant from "tiny-invariant";

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
 * Sencha SDK.
 */
export class SenchaSDK {
  private readonly _router: Router;

  constructor(
    public readonly provider: Provider,
    public readonly programs: Programs
  ) {
    this._router = new Router(provider, programs);
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
  public withSigner(signer: Signer): SenchaSDK {
    return SenchaSDK.load({
      provider: new SolanaProvider(
        this.provider.connection,
        this.provider.broadcaster,
        new SignerWallet(signer),
        this.provider.opts
      ),
      addresses: mapValues(this.programs, (v) => v.programId),
    });
  }

  get programList(): Program[] {
    return Object.values(this.programs) as Program[];
  }

  get router(): Router {
    return this._router;
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
    addresses?: { [K in keyof Programs]?: Address };
  }): SenchaSDK {
    const anchorProvider = new AnchorProvider(
      provider.connection,
      provider.wallet,
      provider.opts
    );
    const allAddresses = { ...PROGRAM_ADDRESSES, ...addresses };
    const programs: Programs = mapValues(
      PROGRAM_ADDRESSES,
      (_: Address, programName: keyof Programs): Program => {
        const address = allAddresses[programName];
        const idl = IDLS[programName];
        invariant(idl, `Unknown IDL: ${programName}`);
        invariant(address, `Unknown Address: ${programName}}`);

        return new Program(idl, address, anchorProvider) as unknown as Program;
      }
    ) as unknown as Programs;
    return new SenchaSDK(provider, programs);
  }
}
