import type { Idl } from "@project-serum/anchor";
import * as anchor from "@project-serum/anchor";
import { chaiSolana } from "@saberhq/chai-solana";
import { SolanaProvider } from "@saberhq/solana-contrib";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getTokenAccount,
  SPLToken,
  Token,
  TOKEN_PROGRAM_ID,
  TokenAmount,
} from "@saberhq/token-utils";
import type { PublicKey, Signer } from "@solana/web3.js";
import chai, { assert } from "chai";

import type { Programs } from "..";
import { SenchaSDK } from "..";

chai.use(chaiSolana);

export type Workspace = Programs;

const anchorProvider = anchor.Provider.env();
anchor.setProvider(anchorProvider);

const provider = SolanaProvider.load({
  connection: anchorProvider.connection,
  sendConnection: anchorProvider.connection,
  wallet: anchorProvider.wallet,
  opts: anchorProvider.opts,
});

export const makeSDK = (): SenchaSDK => {
  return SenchaSDK.load({ provider });
};

type IDLError = NonNullable<Idl["errors"]>[number];

export const assertError = (error: IDLError, other: IDLError): void => {
  assert.strictEqual(error.code, other.code);
  assert.strictEqual(error.msg, other.msg);
};

export const balanceOf = async (
  token: Token,
  owner: PublicKey | Signer
): Promise<TokenAmount> => {
  const account = await SPLToken.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    token.mintAccount,
    "publicKey" in owner ? owner.publicKey : owner
  );
  const result = await getTokenAccount(provider, account);
  return new TokenAmount(token, result.amount);
};

/**
 * Creates a token for testing purposes.
 * @param name
 * @param symbol
 * @param decimals
 * @param minter
 * @returns
 */
export const createTestToken = async (
  name: string,
  symbol: string,
  decimals: number,
  minter: Signer
): Promise<Token> => {
  const mint = await createMint(provider, minter.publicKey, decimals);
  return new Token({
    name,
    address: mint.toString(),
    decimals,
    chainId: 31337,
    symbol,
  });
};
