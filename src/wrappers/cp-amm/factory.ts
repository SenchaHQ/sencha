import type { Provider } from "@saberhq/solana-contrib";
import { TransactionEnvelope } from "@saberhq/solana-contrib";
import type { TokenAmount } from "@saberhq/token-utils";
import {
  createInitMintInstructions,
  createTokenAccount,
  getOrCreateATAs,
  SPLToken,
  TOKEN_PROGRAM_ID,
} from "@saberhq/token-utils";
import type { AccountInfo, PublicKey } from "@solana/web3.js";
import { Keypair, SystemProgram } from "@solana/web3.js";
import chunk from "lodash.chunk";
import invariant from "tiny-invariant";

import { DEFAULT_FACTORY } from "../../constants";
import type {
  CpAmmProgram,
  FactoryData,
  SwapMetaData,
} from "../../programs/cpAmm";
import type { SenchaSDK } from "../../sdk";
import { comparePubkeys } from "../../utils/comparePubkeys";
import { parseSwapMetaData } from "./parsers";
import { findSwapAddress, findSwapMetaAddress } from "./pda";
import type { PendingSwap } from "./types";

/**
 * Wrapper representing the Sencha Factory.
 */
export class SenchaFactory {
  constructor(
    public readonly sdk: SenchaSDK,
    public readonly factory: PublicKey = DEFAULT_FACTORY
  ) {}

  /**
   * The provider.
   */
  get provider(): Provider {
    return this.sdk.provider;
  }

  /**
   * The program.
   */
  get program(): CpAmmProgram {
    return this.sdk.programs.CpAmm;
  }

  /**
   * Fetches the data of this factory.
   * @returns
   */
  async fetch(): Promise<FactoryData | null> {
    return await this.program.account.factory.fetchNullable(this.factory);
  }

  /**
   * Fetches swaps in a range.
   */
  async fetchSwapMetasInRange({
    startIndex,
    endIndex,
    maxBatchSize = 100,
  }: {
    /**
     * Start index of the range of swaps to fetch. Inclusive.
     */
    startIndex: number;
    /**
     * End index of the range of swaps to fetch. Exclusive.
     */
    endIndex: number;
    /**
     * Maximum number of swaps to fetch at a time.
     */
    maxBatchSize?: number;
  }): Promise<readonly SwapMetaData[]> {
    invariant(
      endIndex >= startIndex,
      "endIndex must be greater than startIndex"
    );
    const count = endIndex - startIndex;
    const indicesToFetch = Array(count)
      .fill(null)
      .map((_, i) => i + startIndex);

    const keysToFetch = await Promise.all(
      indicesToFetch.map(async (index) => {
        const [key] = await findSwapMetaAddress({
          factory: this.factory,
          index,
        });
        return key;
      })
    );

    const resultsRaw = (
      await Promise.all(
        chunk(keysToFetch, maxBatchSize).map(async (elements) => {
          return await this.provider.connection.getMultipleAccountsInfo(
            elements
          );
        })
      )
    )
      .flat()
      .filter((x): x is AccountInfo<Buffer> => !!x);

    return resultsRaw.map((result) => {
      return parseSwapMetaData(result.data);
    });
  }

  /**
   * Fetches all swaps in the Factory.
   * @returns
   */
  async fetchAllSwapMetas(): Promise<readonly SwapMetaData[]> {
    const factoryData = await this.fetch();
    if (!factoryData) {
      throw new Error("factory does not exist");
    }
    const swapCount = factoryData.numSwaps.toNumber();
    return this.fetchSwapMetasInRange({ startIndex: 0, endIndex: swapCount });
  }

  /**
   * Initializes a new Swap.
   * @returns
   */
  async initSwap({
    tokenAAmount,
    tokenBAmount,
    poolMintKP,
    payer,
    initialLP,
  }: {
    poolMintKP?: Keypair;
    tokenAAmount: TokenAmount;
    tokenBAmount: TokenAmount;
    /**
     * Provides the initial tokens to the pool.
     */
    initialLP?: PublicKey;
    payer?: PublicKey;
  }): Promise<PendingSwap> {
    const [token0Amount, token1Amount] =
      comparePubkeys(
        tokenAAmount.token.mintAccount,
        tokenBAmount.token.mintAccount
      ) !== -1
        ? [tokenBAmount, tokenAAmount]
        : [tokenAAmount, tokenBAmount];
    return await this.initSwapSorted({
      token0Amount,
      token1Amount,
      poolMintKP,
      payer,
      initialLP,
    });
  }

  /**
   * Initializes a new Swap, assuming the inputs are sorted.
   * @param param0
   * @returns
   */
  async initSwapSorted({
    token0Amount,
    token1Amount,
    poolMintKP = Keypair.generate(),
    payer = this.provider.wallet.publicKey,
    initialLP = this.provider.wallet.publicKey,
  }: {
    poolMintKP?: Keypair;
    token0Amount: TokenAmount;
    token1Amount: TokenAmount;
    /**
     * Provides the initial tokens to the pool.
     */
    initialLP?: PublicKey;
    payer?: PublicKey;
  }): Promise<PendingSwap> {
    const token0 = token0Amount.token;
    const token1 = token1Amount.token;
    if (comparePubkeys(token0.mintAccount, token1.mintAccount) !== -1) {
      throw new Error("mints must be sorted");
    }

    const factoryData = await this.fetch();
    if (!factoryData) {
      throw new Error("Factory does not exist on network");
    }

    const [swap, swapBump] = await findSwapAddress({
      factory: this.factory,
      mintA: token0.mintAccount,
      mintB: token1.mintAccount,
    });
    // TODO: this can cause a race condition if two people call this at the same time
    // we should make this step optional if users complain
    const [swapMeta, metaBump] = await findSwapMetaAddress({
      factory: this.factory,
      index: factoryData.numSwaps.toNumber(),
    });

    const decimals = Math.max(token0.decimals, token1.decimals);

    const initMintTX = await createInitMintInstructions({
      provider: this.provider,
      mintKP: poolMintKP,
      decimals,
      mintAuthority: swap,
      freezeAuthority: swap,
    });

    const initialLPATAs = await getOrCreateATAs({
      provider: this.provider,
      owner: initialLP,
      mints: {
        token0: token0.mintAccount,
        token1: token1.mintAccount,
        lp: poolMintKP.publicKey,
      },
    });

    // create reserves
    const poolATAs = await getOrCreateATAs({
      provider: this.provider,
      mints: {
        token0: token0.mintAccount,
        token1: token1.mintAccount,
        lp: poolMintKP.publicKey,
      },
      owner: swap,
    });

    const feeAccountA = await createTokenAccount({
      provider: this.provider,
      owner: swap,
      mint: token0.mintAccount,
    });
    const feeAccountB = await createTokenAccount({
      provider: this.provider,
      owner: swap,
      mint: token1.mintAccount,
    });

    // Create all of the initial token accounts
    const initAccountsTX = TransactionEnvelope.combineAll(
      initMintTX,
      feeAccountA.tx,
      feeAccountB.tx,
      new TransactionEnvelope(this.provider, [
        ...initialLPATAs.instructions,
        ...poolATAs.instructions,
      ])
    );

    // initialize the swap, sending tokens from the
    // initial LP to the swap.
    const initSwapTX = new TransactionEnvelope(this.provider, [
      SPLToken.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        initialLPATAs.accounts.token0,
        poolATAs.accounts.token0,
        initialLP,
        [],
        token0Amount.toU64()
      ),
      SPLToken.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        initialLPATAs.accounts.token1,
        poolATAs.accounts.token1,
        initialLP,
        [],
        token1Amount.toU64()
      ),
      this.program.instruction.newSwap(swapBump, {
        accounts: {
          factory: this.factory,
          swap,
          poolMint: poolMintKP.publicKey,
          token0: {
            mint: token0.mintAccount,
            reserve: poolATAs.accounts.token0,
            fees: feeAccountA.key,
          },
          token1: {
            mint: token1.mintAccount,
            reserve: poolATAs.accounts.token1,
            fees: feeAccountB.key,
          },
          payer,
          outputLp: initialLPATAs.accounts.lp,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        },
      }),
      this.program.instruction.newSwapMeta(metaBump, {
        accounts: {
          swap,
          swapMeta,
          payer,
          systemProgram: SystemProgram.programId,
        },
      }),
    ]);

    return {
      poolMint: poolMintKP.publicKey,
      swap,
      initAccountsTX,
      initSwapTX,
    };
  }
}
