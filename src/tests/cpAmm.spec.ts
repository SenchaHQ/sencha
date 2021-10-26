/// <reference types="mocha" />

import { expectTX } from "@saberhq/chai-solana";
import {
  PendingTransaction,
  SignerWallet,
  TransactionEnvelope,
} from "@saberhq/solana-contrib";
import {
  createMint,
  createMintToInstruction,
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
import { Connection, Keypair } from "@solana/web3.js";

import { CpAmmWrapper, findSwapAddress } from "..";
import { comparePubkeys } from "../utils/comparePubkeys";
import { makeSDK } from "./workspace";

const CLUSTER_URL = "http://localhost:8899";
const LAMPORTS_PER_SOL = 1000000000;

const DEFAULT_TOKEN_DECIMALS = 6;

const DEFAULT_INITIAL_TOKEN_A_AMOUNT =
  1_000_000 * Math.pow(10, DEFAULT_TOKEN_DECIMALS);
const DEFAULT_INITIAL_TOKEN_B_AMOUNT =
  1_000_000 * Math.pow(10, DEFAULT_TOKEN_DECIMALS);

describe("CpAmm", () => {
  // Read the provider from the configured environment.
  const sencha = makeSDK();

  let tokenAMint: PublicKey;
  let tokenBMint: PublicKey;
  let swap: CpAmmWrapper;
  let payer: Signer;
  let owner: Signer;
  let connection: Connection;

  beforeEach(async () => {
    connection = new Connection(CLUSTER_URL, "single");

    payer = new Keypair();
    await expectTX(
      new PendingTransaction(
        connection,
        await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL)
      )
    );

    owner = new Keypair();
    await expectTX(
      new PendingTransaction(
        connection,
        await connection.requestAirdrop(owner.publicKey, LAMPORTS_PER_SOL)
      )
    );

    const provider = new SignerWallet(payer).createProvider(connection);

    // create test tokens
    const mintAuthority = Keypair.generate();
    await expectTX(
      new PendingTransaction(
        connection,
        await connection.requestAirdrop(
          mintAuthority.publicKey,
          LAMPORTS_PER_SOL
        )
      )
    ).to.be.fulfilled;

    tokenAMint = await createMint(
      provider,
      mintAuthority.publicKey,
      DEFAULT_TOKEN_DECIMALS
    );
    tokenBMint = await createMint(
      provider,
      mintAuthority.publicKey,
      DEFAULT_TOKEN_DECIMALS
    );
    if (comparePubkeys(tokenAMint, tokenBMint) === 1) {
      const nextTokenAMint = tokenBMint;
      tokenBMint = tokenAMint;
      tokenAMint = nextTokenAMint;
    }

    const initialLiquidityProviderKP = owner;
    const tokenInstructions: TransactionInstruction[] = [];

    const {
      accounts: { tokenA: sourceAccountA, tokenB: sourceAccountB },
      instructions,
    } = await getOrCreateATAs({
      provider,
      mints: { tokenA: tokenAMint, tokenB: tokenBMint },
      owner: initialLiquidityProviderKP.publicKey,
    });
    tokenInstructions.push(...instructions);

    // go through the extra step of seeding the initial LP's ATAs
    const preseedLPTokenAInstructions = createMintToInstruction({
      provider,
      mint: tokenAMint,
      mintAuthorityKP: mintAuthority,
      to: sourceAccountA,
      amount: new u64(DEFAULT_INITIAL_TOKEN_A_AMOUNT),
    });

    const preseedLPTokenBInstructions = createMintToInstruction({
      provider,
      mint: tokenBMint,
      mintAuthorityKP: mintAuthority,
      to: sourceAccountB,
      amount: new u64(DEFAULT_INITIAL_TOKEN_B_AMOUNT),
    });

    const tokenTx = new TransactionEnvelope(provider, tokenInstructions)
      .combine(preseedLPTokenAInstructions)
      .combine(preseedLPTokenBInstructions);
    await expectTX(tokenTx, "Create pool user accounts").to.be.fulfilled;

    const seedPoolAccounts = ({
      tokenAAccount,
      tokenBAccount,
    }: {
      tokenAAccount: PublicKey;
      tokenBAccount: PublicKey;
    }) => {
      return {
        instructions: [
          SPLToken.createTransferInstruction(
            TOKEN_PROGRAM_ID,
            sourceAccountA,
            tokenAAccount,
            initialLiquidityProviderKP.publicKey,
            [initialLiquidityProviderKP],
            1_000_000
          ),
          SPLToken.createTransferInstruction(
            TOKEN_PROGRAM_ID,
            sourceAccountB,
            tokenBAccount,
            initialLiquidityProviderKP.publicKey,
            [initialLiquidityProviderKP],
            1_000_000
          ),
        ],
        signers: [initialLiquidityProviderKP],
      };
    };

    const { key: factory, tx: initFactoryTX } = await CpAmmWrapper.newFactory({
      sdk: sencha,
    });
    await expectTX(initFactoryTX, "Create Factory").to.be.fulfilled;

    const { initAccountsTX, initSwapTX } = await CpAmmWrapper.newSwap({
      sdk: sencha,
      factory,
      tokenAMint,
      tokenBMint,
      seedPoolAccounts,
    });

    await expectTX(initAccountsTX, "Create Swap Accounts").to.be.fulfilled;

    await expectTX(initSwapTX, "Create Swap").to.be.fulfilled;

    const [key] = await findSwapAddress({
      factory,
      mintA: tokenAMint,
      mintB: tokenBMint,
      programId: sencha.programs.CpAmm.programId,
    });
    const loadedSwap = await CpAmmWrapper.load({ sdk: sencha, key: key });

    swap = loadedSwap;
  });

  it("initializes reserves correctly", async () => {
    const token0Reserve = await connection.getTokenAccountBalance(
      swap.state.token0.reserves
    );
    const token1Reserve = await connection.getTokenAccountBalance(
      swap.state.token1.reserves
    );

    console.log({ token0Reserve, token1Reserve });
  });
});
