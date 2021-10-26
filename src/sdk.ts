import type { Address } from "@project-serum/anchor";
import { Program, Provider as AnchorProvider } from "@project-serum/anchor";
import type { Event, EventParser, Provider } from "@saberhq/solana-contrib";
import {
  SignerWallet,
  SolanaProvider,
  TransactionEnvelope,
} from "@saberhq/solana-contrib";
import type { TokenAmount } from "@saberhq/token-utils";
import type { Signer, TransactionInstruction } from "@solana/web3.js";
import mapValues from "lodash.mapvalues";
import invariant from "tiny-invariant";

import { PROGRAM_ADDRESSES } from ".";
import type { CpAmmProgram } from "./programs/cpAmm";
import { CpammJSON } from "./programs/cpAmm";
import type { ActionPlan, Trade } from "./router";
import { Router } from "./router";
import { EventParser as SEventParser } from "./utils/eventParser";

/**
 * Program IDLs.
 */
export const IDLS = {
  CpAmm: CpammJSON,
};

export interface Programs {
  CpAmm: CpAmmProgram;
}

/**
 * Sencha SDK.
 */
export class SenchaSDK {
  private readonly _router: Router;

  constructor(
    public readonly provider: Provider,
    public readonly programs: Programs
  ) {
    this._router = new Router(provider, programs);
  }

  /**
   * Creates a new instance of the SDK with the given keypair.
   */
  public withSigner(signer: Signer): SenchaSDK {
    return SenchaSDK.load({
      provider: new SolanaProvider(
        this.provider.connection,
        this.provider.broadcaster,
        new SignerWallet(signer),
        this.provider.opts
      ),
      addresses: mapValues(this.programs, (v) => v.programId),
    });
  }

  get programList(): Program[] {
    return Object.values(this.programs) as Program[];
  }

  get router(): Router {
    return this._router;
  }

  public planTrade(trade: Trade, minimumAmountOut: TokenAmount): ActionPlan {
    return this.router.planTrade(trade, minimumAmountOut);
  }
  public parseProgramLogs(logs: string[]): Event[] {
    const events: Event[] = [];
    this.programList.forEach((prog) => {
      const parser = new SEventParser(prog.coder, prog.programId);
      parser.parseLogs(logs, (event) => {
        events.push(event);
      });
    });
    return events;
  }

  /**
   * Gets the event parser for the given event.
   * @param program Name of program to parse.
   * @returns Event parser
   */
  public getParser<E extends Event>(program: keyof Programs): EventParser<E> {
    const parser = new SEventParser(
      this.programs[program].coder,
      this.programs[program].programId
    );

    return (logs) => {
      const events: E[] = [];
      parser.parseLogs(logs, (event) => {
        events.push(event as E);
      });
      return events;
    };
  }

  /**
   * Constructs a new transaction envelope.
   * @param instructions
   * @param signers
   * @returns
   */
  public newTx(
    instructions: TransactionInstruction[],
    signers?: Signer[]
  ): TransactionEnvelope {
    return new TransactionEnvelope(this.provider, instructions, signers);
  }

  /**
   * Loads the SDK.
   * @returns
   */
  public static load({
    provider,
    addresses = PROGRAM_ADDRESSES,
  }: {
    // Provider
    provider: Provider;
    // Addresses of each program.
    addresses?: { [K in keyof Programs]?: Address };
  }): SenchaSDK {
    const anchorProvider = new AnchorProvider(
      provider.connection,
      provider.wallet,
      provider.opts
    );
    const allAddresses = { ...PROGRAM_ADDRESSES, ...addresses };
    const programs: Programs = mapValues(
      PROGRAM_ADDRESSES,
      (_: Address, programName: keyof Programs): Program => {
        const address = allAddresses[programName];
        const idl = IDLS[programName];
        invariant(idl, `Unknown IDL: ${programName}`);
        invariant(address, `Unknown Address: ${programName}}`);

        return new Program(idl, address, anchorProvider) as unknown as Program;
      }
    ) as unknown as Programs;
    return new SenchaSDK(provider, programs);
  }
}
