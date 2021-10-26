import { Keypair } from "@solana/web3.js";
import fs from "fs";

export const readKeyfile = (path: string): Keypair => {
  return Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(path, { encoding: "utf-8" })))
  );
};
