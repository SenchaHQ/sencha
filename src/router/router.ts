import type { Address } from "@project-serum/anchor";
import { Program, Provider as AnchorProvider } from "@project-serum/anchor";
import type { Provider } from "@saberhq/solana-contrib";
import { SignerWallet, SolanaProvider } from "@saberhq/solana-contrib";
import type { TokenAmount } from "@saberhq/token-utils";
import type { Signer } from "@solana/web3.js";
import mapValues from "lodash.mapvalues";
import invariant from "tiny-invariant";

import type { Programs } from "../";
import { PROGRAM_IDLS } from "../";
import { PROGRAM_ADDRESSES } from "../constants";
import type { Trade } from "./entities/trade";
import { ActionPlan } from "./wrappers/actionPlan";

/**
 * Saber Router SDK.
 */
export class Router {
  constructor(readonly provider: Provider, readonly programs: Programs) {}

  /**
   * Creates a new instance of the Router with the given keypair.
   */
  withSigner(keypair: Signer): Router {
    return Router.load({
      provider: new SolanaProvider(
        this.provider.connection,
        this.provider.broadcaster,
        new SignerWallet(keypair),
        this.provider.opts
      ),
      addresses: mapValues(this.programs, (v) => v.programId),
    });
  }

  /**
   * Plans a trade, returning an executable Action Plan which uses the continuation
   * router to perform the desired sequence of swaps ("actions") atomically.
   *
   * @param trade
   * @param minimumAmountOut
   * @returns
   */
  planTrade(trade: Trade, minimumAmountOut: TokenAmount): ActionPlan {
    return new ActionPlan(
      this,
      trade.inputAmount,
      minimumAmountOut,
      trade.route.pairs.map((pair, i) => {
        const outputToken = trade.route.path[i + 1];
        invariant(outputToken, "no output token");
        return pair.asAction(outputToken);
      })
    );
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
  }): Router {
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
        const idl = PROGRAM_IDLS[programName];
        return new Program(idl, address, anchorProvider) as unknown as Program;
      }
    ) as unknown as Programs;
    return new Router(provider, programs);
  }
}
