import { utils } from "@project-serum/anchor";
import { u64 } from "@saberhq/token-utils";
import { PublicKey } from "@solana/web3.js";

import { comparePubkeys, PROGRAM_ADDRESSES } from "../..";

export const findFactoryAddress = async ({
  base,
  programId = PROGRAM_ADDRESSES.CpAmm,
}: {
  base: PublicKey;
  programId?: PublicKey;
}): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [utils.bytes.utf8.encode("Factory"), base.toBuffer()],
    programId
  );
};

export const findSwapAddress = async ({
  factory,
  mintA,
  mintB,
  programId = PROGRAM_ADDRESSES.CpAmm,
}: {
  factory: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  programId?: PublicKey;
}): Promise<[PublicKey, number]> => {
  const [token0Mint, token1Mint] =
    comparePubkeys(mintA, mintB) !== -1 ? [mintB, mintA] : [mintA, mintB];

  return await PublicKey.findProgramAddress(
    [
      utils.bytes.utf8.encode("SwapInfo"),
      factory.toBuffer(),
      token0Mint.toBuffer(),
      token1Mint.toBuffer(),
    ],
    programId
  );
};

export const findSwapMetaAddress = async ({
  factory,
  index,
  programId = PROGRAM_ADDRESSES.CpAmm,
}: {
  factory: PublicKey;
  index: number;
  programId?: PublicKey;
}): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [
      utils.bytes.utf8.encode("SwapMeta"),
      factory.toBuffer(),
      new u64(index).toBuffer(),
    ],
    programId
  );
};
