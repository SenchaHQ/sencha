/// <reference types="mocha" />

import "chai-bn";

import { expectTX } from "@saberhq/chai-solana";
import {
  PendingTransaction,
  SignerWallet,
  TransactionEnvelope,
} from "@saberhq/solana-contrib";
import {
  createMint,
  createMintToInstruction,
  getMintInfo,
  getOrCreateATAs,
  getTokenAccount,
  Token,
  TokenAmount,
  u64,
} from "@saberhq/token-utils";
import type { Signer, TransactionInstruction } from "@solana/web3.js";
import { Connection, Keypair } from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";

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

  let token0: Token;
  let token1: Token;
  let swap: CpAmmWrapper;
  let payer: Signer;
  let owner: Keypair;
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

    token0 = Token.fromMint(
      await createMint(
        provider,
        mintAuthority.publicKey,
        DEFAULT_TOKEN_DECIMALS
      ),
      DEFAULT_TOKEN_DECIMALS
    );
    token1 = Token.fromMint(
      await createMint(
        provider,
        mintAuthority.publicKey,
        DEFAULT_TOKEN_DECIMALS
      ),
      DEFAULT_TOKEN_DECIMALS
    );
    if (comparePubkeys(token0.mintAccount, token1.mintAccount) === 1) {
      const nextToken0 = token1;
      token1 = token0;
      token0 = nextToken0;
    }

    const initialLiquidityProviderKP = owner;
    const tokenInstructions: TransactionInstruction[] = [];

    const {
      accounts: { token0: sourceAccountA, token1: sourceAccountB },
      instructions,
    } = await getOrCreateATAs({
      provider,
      mints: { token0: token0.mintAccount, token1: token1.mintAccount },
      owner: initialLiquidityProviderKP.publicKey,
    });
    tokenInstructions.push(...instructions);

    // go through the extra step of seeding the initial LP's ATAs
    const preseedLPTokenAInstructions = createMintToInstruction({
      provider,
      mint: token0.mintAccount,
      mintAuthorityKP: mintAuthority,
      to: sourceAccountA,
      amount: new u64(DEFAULT_INITIAL_TOKEN_A_AMOUNT),
    });

    const preseedLPTokenBInstructions = createMintToInstruction({
      provider,
      mint: token1.mintAccount,
      mintAuthorityKP: mintAuthority,
      to: sourceAccountB,
      amount: new u64(DEFAULT_INITIAL_TOKEN_B_AMOUNT),
    });

    const tokenTx = new TransactionEnvelope(provider, tokenInstructions)
      .combine(preseedLPTokenAInstructions)
      .combine(preseedLPTokenBInstructions);
    await expectTX(tokenTx, "Create pool user accounts").to.be.fulfilled;

    const { key: factoryKey, tx: initFactoryTX } =
      await CpAmmWrapper.newFactory({
        sdk: sencha,
      });
    await expectTX(initFactoryTX, "Create Factory").to.be.fulfilled;

    const ownerSDK = sencha.withSigner(owner);

    const tokenAAmount = new TokenAmount(token0, 1_000_000);
    const tokenBAmount = new TokenAmount(token1, 1_000_000);

    const { initAccountsTX, initSwapTX } = await ownerSDK
      .loadFactory(factoryKey)
      .initSwap({
        tokenAAmount,
        tokenBAmount,
      });

    await expectTX(initAccountsTX, "Create Swap Accounts").to.be.fulfilled;

    await expectTX(initSwapTX, "Create Swap").to.be.fulfilled;

    const [key] = await findSwapAddress({
      factory: factoryKey,
      mintA: token0.mintAccount,
      mintB: token1.mintAccount,
      programId: sencha.programs.CpAmm.programId,
    });
    const loadedSwap = await CpAmmWrapper.load({ sdk: sencha, key: key });

    swap = loadedSwap;
  });

  it("initializes reserves correctly", async () => {
    const token0Reserve = await getTokenAccount(
      sencha.provider,
      swap.state.token0.reserves
    );
    const token1Reserve = await getTokenAccount(
      sencha.provider,
      swap.state.token1.reserves
    );
    expect(token0Reserve.amount).to.bignumber.eq("1000000");
    expect(token1Reserve.amount).to.bignumber.eq("1000000");

    const { accounts: ownerAccounts } = await getOrCreateATAs({
      provider: sencha.provider,
      mints: { poolMint: swap.state.poolMint },
      owner: owner.publicKey,
    });

    // TODO
    // [x] validate that the owner has the correct amount of initial lp tokens
    // [x] validate that the total supply of lp tokens matches the initial lp tokens minted to the user

    // withdraw
    // withdraw and check that withdrawing all liquidity is diallowed
    // withdraw and check that withdrawing under the liquidity should fail
    // random-ass withdrawals
    // check cumulative price figure field

    // swap
    // swap and check that swapping infinte amount should fail
    // check cumulative price figure field

    // deposit
    // deposit and checkthat the cumulative price figure is correct

    // twap
    // copy UNISWAP's twap oracle tests

    const ownerPoolMintAccount = await getTokenAccount(
      sencha.provider,
      ownerAccounts.poolMint
    );
    const expectedLPAmount = new BN(
      Math.sqrt(token0Reserve.amount.mul(token1Reserve.amount).toNumber())
    );
    expect(ownerPoolMintAccount.amount).to.bignumber.eq(expectedLPAmount);

    const lpMintInfo = await getMintInfo(sencha.provider, swap.state.poolMint);
    expect(lpMintInfo.supply).to.bignumber.eq(expectedLPAmount);

    //  const poolMint = await getTokenAccount(sencha.provider, swap.state.poolMint)
    //  poolMint.amount
  });

  it("withdraw", async () => {
    // swap.withdraw({ poolTokenAmount: new TokenAmount(swap.state.poolMint) });
  });
});
