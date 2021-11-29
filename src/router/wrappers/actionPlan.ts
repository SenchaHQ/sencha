import type { Provider } from "@saberhq/solana-contrib";
import { TransactionEnvelope } from "@saberhq/solana-contrib";
import type { Token, TokenAmount } from "@saberhq/token-utils";
import {
  createTokenAccount,
  getOrCreateATAs,
  SPLToken,
  TOKEN_PROGRAM_ID,
  u64,
} from "@saberhq/token-utils";
import type {
  PublicKey,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";

import type { CpAmmWrapper } from "../..";
import type { CpAmmProgram } from "../../programs";
import type { Router } from "../router";

interface MFAction {
  swap: CpAmmWrapper;
  action: "mfSwap";
}

export type Action = {
  outputToken: Token;
} & MFAction;

export class ActionPlan {
  constructor(
    public readonly router: Router,
    public readonly inputAmount: TokenAmount,
    public readonly minimumAmountOut: TokenAmount,
    public readonly actions: Action[] = []
  ) {}

  get program(): CpAmmProgram {
    return this.router.programs.CpAmm;
  }

  public addAction(...actions: Action[]): ActionPlan {
    this.actions.push(...actions);
    return this;
  }

  public async buildTX(): Promise<TransactionEnvelope> {
    const { provider } = this.router;
    const user = provider.wallet.publicKey;

    const initInstructions: TransactionInstruction[] = [];
    const signers: Signer[] = [];

    const { accounts, instructions: initUserTokenAccountsInstructions } =
      await getOrCreateATAs({
        provider,
        mints: {
          input: this.inputAmount.token.mintAccount,
          output: this.minimumAmountOut.token.mintAccount,
        },
      });

    const swapInstructions: TransactionInstruction[] = [];
    const closeInstructions: TransactionInstruction[] = [];

    let nextInput: PublicKey = accounts.input;
    for (const [i, action] of this.actions.entries()) {
      const isLast = i === this.actions.length - 1;

      if (action.action === "mfSwap") {
        const {
          instruction,
          accounts: [_, outputAccount],
          createOutputAccount,
        } = await makeSwapInstruction({
          provider,
          cpAmm: this.router.programs.CpAmm,
          action,
          input: nextInput,
          outputAccount: isLast ? accounts.output : undefined,
          inputAmount: i === 0 ? this.inputAmount : undefined,
          minimumAmountOut: isLast ? this.minimumAmountOut : undefined,
        });

        if (createOutputAccount) {
          initInstructions.push(...createOutputAccount.instructions);
          signers.push(...createOutputAccount.signers);
        }
        swapInstructions.push(instruction);
        if (createOutputAccount) {
          closeInstructions.push(
            SPLToken.createCloseAccountInstruction(
              TOKEN_PROGRAM_ID,
              outputAccount,
              user,
              user,
              []
            )
          );
        }
        nextInput = outputAccount;
      } else {
        throw new Error("unimplemented");
      }
    }

    return new TransactionEnvelope(
      provider,
      [
        ...initUserTokenAccountsInstructions,
        ...initInstructions,
        ...swapInstructions,
        ...closeInstructions,
      ],
      [...signers]
    );
  }
}

const makeSwapInstruction = async ({
  provider,
  cpAmm,
  action,
  input,
  outputAccount,

  inputAmount,
  minimumAmountOut,
}: {
  provider: Provider;
  cpAmm: CpAmmProgram;
  action: Action & MFAction;
  input: PublicKey;
  outputAccount?: PublicKey;

  inputAmount?: TokenAmount;
  minimumAmountOut?: TokenAmount;
}): Promise<{
  accounts: [PublicKey, PublicKey];
  mints: PublicKey[];
  createOutputAccount: TransactionEnvelope | null;
  instruction: TransactionInstruction;
}> => {
  const [inputToken, outputToken] = action.outputToken.mintAccount.equals(
    action.swap.state.token0.mint
  )
    ? (["token1", "token0"] as const)
    : (["token0", "token1"] as const);
  const user = provider.wallet.publicKey;
  const { swap } = action;

  let output = outputAccount;
  let createOutputAccount: TransactionEnvelope | null = null;
  if (!output) {
    const { tx, key } = await createTokenAccount({
      provider,
      mint: action.outputToken.mintAccount,
      owner: user,
    });

    output = key;
    createOutputAccount = tx;
  }

  const ctx = {
    accounts: {
      user: {
        tokenProgram: TOKEN_PROGRAM_ID,
        swap: swap.key,
        userAuthority: user,
      },
      input: {
        user: input,
        reserve: swap.state[inputToken].reserves,
        fees: swap.state[inputToken].adminFees,
      },
      output: {
        user: output,
        reserve: swap.state[outputToken].reserves,
        fees: swap.state[outputToken].adminFees,
      },
    },
  } as const;

  const instruction = inputAmount
    ? cpAmm.instruction.swap(
        inputAmount.toU64(),
        minimumAmountOut?.toU64() ?? new u64(0),
        ctx
      )
    : cpAmm.instruction.swapMax(minimumAmountOut?.toU64() ?? new u64(0), ctx);
  return {
    accounts: [input, output],
    mints: [swap.state[inputToken].mint, swap.state[outputToken].mint],
    createOutputAccount,
    instruction,
  };
};
