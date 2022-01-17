import type { Provider } from "@saberhq/solana-contrib";
import { TransactionEnvelope } from "@saberhq/solana-contrib";
import type { TokenAmount, u64 } from "@saberhq/token-utils";
import {
  createInitMintInstructions,
  createTokenAccount,
  getMintInfo,
  getOrCreateATAs,
  TOKEN_PROGRAM_ID,
} from "@saberhq/token-utils";
import type {
  KeyedAccountInfo,
  PublicKey,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import { Keypair, SystemProgram } from "@solana/web3.js";

import type { SenchaSDK } from "../..";
import { DEFAULT_FACTORY } from "../../constants";
import type { CpAmmProgram, FactoryData } from "../../programs/cpAmm";
import { comparePubkeys } from "../../utils/comparePubkeys";
import { decodeFees } from "./fee";
import { PARSE_SWAP_INFO } from "./parsers";
import {
  findFactoryAddress,
  findSwapAddress,
  findSwapMetaAddress,
} from "./pda";
import type { CpAmmState, PendingSwap } from "./types";

export * from "./fee";
export * from "./parsers";
export * from "./pda";

// TODO: unsure if this is ESM friendly
export * from "./types";

export type ISeedPoolAccountsFn = (args: {
  tokenAAccount: PublicKey;
  tokenBAccount: PublicKey;
}) => { instructions: TransactionInstruction[]; signers: Signer[] };

export class CpAmmWrapper {
  constructor(
    readonly sdk: SenchaSDK,
    readonly key: PublicKey,
    readonly state: CpAmmState
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

  static async load({
    sdk,
    key,
  }: {
    sdk: SenchaSDK;
    key: PublicKey;
  }): Promise<CpAmmWrapper> {
    const program = sdk.programs.CpAmm;

    const swapInfo = await program.provider.connection.getAccountInfo(key);
    if (!swapInfo) {
      throw new Error("swap not found");
    }

    return CpAmmWrapper.loadWithData({
      sdk,
      info: {
        accountId: key,
        accountInfo: swapInfo,
      },
    });
  }

  static loadWithData({
    sdk,
    info,
  }: {
    sdk: SenchaSDK;
    info: KeyedAccountInfo;
  }): CpAmmWrapper {
    const swapData = PARSE_SWAP_INFO(info);
    const fees = decodeFees(swapData.fees);
    const state: CpAmmState = {
      ...swapData,
      fees: fees,
    };

    return new CpAmmWrapper(sdk, info.accountId, state);
  }

  static async newFactory({
    sdk,
    baseKP = Keypair.generate(),
    payer = sdk.provider.wallet.publicKey,
  }: {
    sdk: SenchaSDK;
    baseKP?: Signer;
    payer?: PublicKey;
  }): Promise<{ key: PublicKey; tx: TransactionEnvelope }> {
    const program = sdk.programs.CpAmm;
    const [factory, bump] = await findFactoryAddress({
      base: baseKP.publicKey,
      programId: program.programId,
    });

    const initFactoryTX = new TransactionEnvelope(
      sdk.provider,
      [
        program.instruction.newFactory(bump, {
          accounts: {
            base: baseKP.publicKey,
            factory,
            payer,
            systemProgram: SystemProgram.programId,
          },
        }),
      ],
      [baseKP]
    );

    return {
      key: factory,
      tx: initFactoryTX,
    };
  }

  /**
   * Creates a new swap.
   * TODO: this should just be a wrapper over the program, so seedPoolAccounts helper
   * utils moved outside
   * @deprecated see {@link SenchaFactory#initSwap}.
   * @returns
   */
  static async newSwap({
    sdk,
    tokenAMint,
    tokenBMint,
    poolMintKP = Keypair.generate(),
    factory = DEFAULT_FACTORY,
    decimals,
    payer = sdk.provider.wallet.publicKey,
    outputLp = sdk.provider.wallet.publicKey,
    tokenProgram = TOKEN_PROGRAM_ID,
    seedPoolAccounts,
  }: {
    sdk: SenchaSDK;

    poolMintKP?: Keypair;
    tokenAMint: PublicKey;
    tokenBMint: PublicKey;
    factory?: PublicKey;
    decimals?: number;
    payer?: PublicKey;
    outputLp?: PublicKey;
    tokenProgram?: PublicKey;
    seedPoolAccounts: ISeedPoolAccountsFn;
  }): Promise<PendingSwap> {
    if (comparePubkeys(tokenAMint, tokenBMint) !== -1) {
      throw new Error("mints must be sorted");
    }

    const program = sdk.programs.CpAmm;
    const [swap, swapBump] = await findSwapAddress({
      factory,
      mintA: tokenAMint,
      mintB: tokenBMint,
      programId: program.programId,
    });

    const factoryData: FactoryData | null =
      await program.account.factory.fetchNullable(factory);
    if (!factoryData) {
      throw new Error("Factory does not exist on network");
    }
    const [swapMeta, metaBump] = await findSwapMetaAddress({
      factory,
      index: factoryData.numSwaps.toNumber(),
      programId: program.programId,
    });

    const realDecimals =
      decimals === undefined
        ? await (async () => {
            const mintA = await getMintInfo(sdk.provider, tokenAMint);
            const mintB = await getMintInfo(sdk.provider, tokenBMint);
            return Math.max(mintA.decimals, mintB.decimals);
          })()
        : decimals;

    const initMint = await createInitMintInstructions({
      provider: sdk.provider,
      mintKP: poolMintKP,
      decimals: realDecimals,
      mintAuthority: swap,
      freezeAuthority: swap,
    });

    const { accounts: initLp, instructions: createInitialLp } =
      await getOrCreateATAs({
        provider: sdk.provider,
        owner: outputLp,
        mints: {
          outputLp: poolMintKP.publicKey,
        },
      });

    // create reserves
    const { accounts: reserves, instructions: createReserves } =
      await getOrCreateATAs({
        provider: sdk.provider,
        mints: {
          tokenA: tokenAMint,
          tokenB: tokenBMint,
          lpReserve: poolMintKP.publicKey,
        },
        owner: swap,
      });

    const feeAccountA = await createTokenAccount({
      provider: sdk.provider,
      owner: swap,
      mint: tokenAMint,
    });

    const feeAccountB = await createTokenAccount({
      provider: sdk.provider,
      owner: swap,
      mint: tokenBMint,
    });

    const seedPoolAccountsResult = seedPoolAccounts({
      tokenAAccount: reserves.tokenA,
      tokenBAccount: reserves.tokenB,
    });

    const initAccountsTX = new TransactionEnvelope(
      sdk.provider,
      [
        ...initMint.instructions,
        ...createInitialLp,
        ...createReserves,
        ...feeAccountA.tx.instructions,
        ...feeAccountB.tx.instructions,
      ],
      [
        ...initMint.signers,
        ...feeAccountA.tx.signers,
        ...feeAccountB.tx.signers,
      ]
    );

    const initSwapTX = new TransactionEnvelope(
      sdk.provider,
      [
        ...seedPoolAccountsResult.instructions,
        program.instruction.newSwap(swapBump, {
          accounts: {
            factory,
            swap,
            poolMint: poolMintKP.publicKey,
            token0: {
              mint: tokenAMint,
              reserve: reserves.tokenA,
              fees: feeAccountA.key,
            },
            token1: {
              mint: tokenBMint,
              reserve: reserves.tokenB,
              fees: feeAccountB.key,
            },
            payer,
            outputLp: initLp.outputLp,
            tokenProgram,
            systemProgram: SystemProgram.programId,
          },
        }),
        program.instruction.newSwapMeta(metaBump, {
          accounts: {
            swap,
            swapMeta,
            payer,
            systemProgram: SystemProgram.programId,
          },
        }),
      ],
      [...seedPoolAccountsResult.signers]
    );

    return {
      poolMint: poolMintKP.publicKey,
      swap,
      initSwapTX,
      initAccountsTX,
    };
  }

  /**
   * Creates the ATAs used for the instruction if necessary.
   */
  private async _getOrCreateATAs(
    userAuthority: PublicKey = this.provider.wallet.publicKey
  ) {
    return await getOrCreateATAs({
      provider: this.provider,
      mints: {
        token0: this.state.token0.mint,
        token1: this.state.token1.mint,
        lpToken: this.state.poolMint,
      },
      owner: userAuthority,
    });
  }

  private _getCommonAccounts(
    userAuthority: PublicKey = this.provider.wallet.publicKey
  ) {
    return {
      poolMint: this.state.poolMint,
      user: {
        tokenProgram: TOKEN_PROGRAM_ID,
        swap: this.key,
        userAuthority,
      },
    };
  }

  /**
   * Deposits LP tokens into a pool.
   * @returns
   */
  async deposit({
    poolTokenAmount,
    maximumAmountIn0,
    maximumAmountIn1,
    userAuthority = this.provider.wallet.publicKey,
  }: {
    poolTokenAmount: u64;
    maximumAmountIn0: u64;
    maximumAmountIn1: u64;
    userAuthority?: PublicKey;
  }): Promise<TransactionEnvelope> {
    const instructions: TransactionInstruction[] = [];

    const { accounts, instructions: ataInstructions } =
      await this._getOrCreateATAs(userAuthority);
    instructions.push(...ataInstructions);

    instructions.push(
      this.program.instruction.deposit(
        poolTokenAmount,
        maximumAmountIn0,
        maximumAmountIn1,
        {
          accounts: {
            ...this._getCommonAccounts(userAuthority),
            input0: {
              user: accounts.token0,
              reserve: this.state.token0.reserves,
            },
            input1: {
              user: accounts.token1,
              reserve: this.state.token1.reserves,
            },
            outputLp: accounts.lpToken,
          },
        }
      )
    );

    return new TransactionEnvelope(this.provider, instructions);
  }

  async withdraw({
    poolTokenAmount,
    minimumAmountOut0,
    minimumAmountOut1,
    userAuthority = this.provider.wallet.publicKey,
  }: {
    poolTokenAmount: u64;
    minimumAmountOut0: u64;
    minimumAmountOut1: u64;
    userAuthority?: PublicKey;
  }): Promise<TransactionEnvelope> {
    const instructions: TransactionInstruction[] = [];

    const { accounts, instructions: ataInstructions } =
      await this._getOrCreateATAs(userAuthority);
    instructions.push(...ataInstructions);

    instructions.push(
      this.program.instruction.withdraw(
        poolTokenAmount,
        minimumAmountOut0,
        minimumAmountOut1,
        {
          accounts: {
            ...this._getCommonAccounts(userAuthority),
            output0: {
              user: accounts.token0,
              reserve: this.state.token0.reserves,
              fees: this.state.token0.adminFees,
            },
            output1: {
              user: accounts.token1,
              reserve: this.state.token1.reserves,
              fees: this.state.token1.adminFees,
            },
            inputLp: accounts.lpToken,
          },
        }
      )
    );

    return new TransactionEnvelope(this.provider, instructions);
  }

  async swap({
    amountIn,
    minAmountOut,
    userAuthority = this.provider.wallet.publicKey,
  }: {
    userAuthority?: PublicKey;
    amountIn: TokenAmount;
    minAmountOut: TokenAmount;
  }): Promise<TransactionEnvelope> {
    const instructions: TransactionInstruction[] = [];

    const { accounts, instructions: ataInstructions } = await getOrCreateATAs({
      provider: this.provider,
      mints: {
        token0: this.state.token0.mint,
        token1: this.state.token1.mint,
        lpToken: this.state.poolMint,
      },
      owner: userAuthority,
    });
    instructions.push(...ataInstructions);

    const [inputToken, outputToken] = amountIn.token.mintAccount.equals(
      this.state.token0.mint
    )
      ? (["token0", "token1"] as const)
      : (["token1", "token0"] as const);

    instructions.push(
      this.program.instruction.swap(amountIn.toU64(), minAmountOut.toU64(), {
        accounts: {
          ...this._getCommonAccounts(userAuthority),
          input: {
            user: accounts[inputToken],
            reserve: this.state[inputToken].reserves,
            fees: this.state[inputToken].adminFees,
          },
          output: {
            user: accounts[outputToken],
            reserve: this.state[outputToken].reserves,
            fees: this.state[outputToken].adminFees,
          },
        },
      })
    );

    return new TransactionEnvelope(this.provider, instructions);
  }
}
