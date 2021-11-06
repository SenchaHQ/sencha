import { expectTX } from "@saberhq/chai-solana";
import {
  PendingTransaction,
  TransactionEnvelope,
} from "@saberhq/solana-contrib";
import {
  createMint,
  createMintToInstruction,
  getOrCreateATAs,
  Token,
  TokenAmount,
  u64,
} from "@saberhq/token-utils";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

import { CpAmmWrapper } from "../wrappers/cp-amm";
import { makeSDK } from "./workspace";

const DEFAULT_TOKEN_DECIMALS = 6;

const DEFAULT_INITIAL_TOKEN_A_AMOUNT =
  1_000_000 * Math.pow(10, DEFAULT_TOKEN_DECIMALS);
const DEFAULT_INITIAL_TOKEN_B_AMOUNT =
  1_000_000 * Math.pow(10, DEFAULT_TOKEN_DECIMALS);

describe("Registry", () => {
  it("can fetch all swaps", async () => {
    const owner = Keypair.generate();
    const sencha = makeSDK().withSigner(owner);

    await expectTX(
      new PendingTransaction(
        sencha.provider.connection,
        await sencha.provider.connection.requestAirdrop(
          owner.publicKey,
          LAMPORTS_PER_SOL
        )
      )
    ).to.be.fulfilled;

    const { key: factoryKey, tx: initFactoryTX } =
      await CpAmmWrapper.newFactory({
        sdk: sencha,
      });
    await expectTX(initFactoryTX, "init factory").to.be.fulfilled;

    // must be in series due to the race condition
    const ownerSDK = sencha.withSigner(owner);
    for (let i = 0; i < 5; i++) {
      const randTokenA = Token.fromMint(
        await createMint(
          ownerSDK.provider,
          owner.publicKey,
          DEFAULT_TOKEN_DECIMALS
        ),
        DEFAULT_TOKEN_DECIMALS
      );
      const randTokenB = Token.fromMint(
        await createMint(
          ownerSDK.provider,
          owner.publicKey,
          DEFAULT_TOKEN_DECIMALS
        ),
        DEFAULT_TOKEN_DECIMALS
      );

      const {
        accounts: { token0: sourceAccountA, token1: sourceAccountB },
        instructions,
      } = await getOrCreateATAs({
        provider: ownerSDK.provider,
        mints: {
          token0: randTokenA.mintAccount,
          token1: randTokenB.mintAccount,
        },
        owner: owner.publicKey,
      });

      // go through the extra step of seeding the initial LP's ATAs
      const preseedLPTokenAInstructions = createMintToInstruction({
        provider: ownerSDK.provider,
        mint: randTokenA.mintAccount,
        mintAuthorityKP: owner,
        to: sourceAccountA,
        amount: new u64(DEFAULT_INITIAL_TOKEN_A_AMOUNT),
      });

      const preseedLPTokenBInstructions = createMintToInstruction({
        provider: ownerSDK.provider,
        mint: randTokenB.mintAccount,
        mintAuthorityKP: owner,
        to: sourceAccountB,
        amount: new u64(DEFAULT_INITIAL_TOKEN_B_AMOUNT),
      });

      await expectTX(
        TransactionEnvelope.combineAll(
          new TransactionEnvelope(ownerSDK.provider, [...instructions]),
          preseedLPTokenAInstructions,
          preseedLPTokenBInstructions
        ),
        "preseed"
      ).to.be.fulfilled;

      const tokenAAmount = new TokenAmount(randTokenA, 1_000_000);
      const tokenBAmount = new TokenAmount(randTokenB, 1_000_000);
      const { initAccountsTX, initSwapTX } = await ownerSDK
        .loadFactory(factoryKey)
        .initSwap({
          tokenAAmount,
          tokenBAmount,
        });

      await expectTX(initAccountsTX, "Create Swap Accounts").to.be.fulfilled;
      await expectTX(initSwapTX, "Create Swap").to.be.fulfilled;
    }

    const metas = await ownerSDK.loadFactory(factoryKey).fetchAllSwapMetas();

    // 5 swaps were created so we should be fetching 5
    expect(metas.length).to.be.equal(5);
  });
});
