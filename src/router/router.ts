import { newProgramMap } from "@saberhq/anchor-contrib";
import type { Provider } from "@saberhq/solana-contrib";
import { SignerWallet, SolanaProvider } from "@saberhq/solana-contrib";
import type { TokenAmount } from "@saberhq/token-utils";
import type { PublicKey, Signer } from "@solana/web3.js";
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
    addresses?: { [K in keyof Programs]?: PublicKey };
  }): Router {
    const allAddresses = { ...PROGRAM_ADDRESSES, ...addresses };
    const programs: Programs = newProgramMap<Programs>(
      provider,
      PROGRAM_IDLS,
      allAddresses
    );
    return new Router(provider, programs);
  }
}
