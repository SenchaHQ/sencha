import type { PublicKey } from "@solana/web3.js";
import zip from "lodash.zip";
import invariant from "tiny-invariant";

/**
 * Compares two pubkeys for sorting purposes.
 * @param a
 * @param b
 * @returns
 */
export const comparePubkeys = (a: PublicKey, b: PublicKey): number => {
  const bytesA = a.toBytes();
  const bytesB = b.toBytes();
  return (
    zip(bytesA, bytesB)
      .map(([a, b]) => {
        invariant(typeof a === "number" && typeof b === "number", "a and b");
        if (a > b) {
          return 1;
        } else if (a < b) {
          return -1;
        }
        return null;
      })
      .find((x) => x !== null) ?? 0
  );
};
