import type { Coder } from "@project-serum/anchor";
import type { Event } from "@saberhq/solana-contrib";
import type { PublicKey } from "@solana/web3.js";
import invariant from "tiny-invariant";

const LOG_START_INDEX = "Program log: ".length;

export class EventParser {
  private coder: Coder;
  private programId: PublicKey;

  constructor(coder: Coder, programId: PublicKey) {
    this.coder = coder;
    this.programId = programId;
  }

  // Each log given, represents an array of messages emitted by
  // a single transaction, which can execute many different programs across
  // CPI boundaries. However, the subscription is only interested in the
  // events emitted by *this* program. In achieving this, we keep track of the
  // program execution context by parsing each log and looking for a CPI
  // `invoke` call. If one exists, we know a new program is executing. So we
  // push the programId onto a stack and switch the program context. This
  // allows us to track, for a given log, which program was executing during
  // its emission, thereby allowing us to know if a given log event was
  // emitted by *this* program. If it was, then we parse the raw string and
  // emit the event if the string matches the event being subscribed to.
  public parseLogs(logs: string[], callback: (log: Event) => void): void {
    const logScanner = new LogScanner(logs);
    const execution = new ExecutionContext(logScanner.next() as string);
    let log = logScanner.next();
    while (log !== null) {
      const [event, newProgram, didPop] = this.handleLog(execution, log);
      if (event) {
        callback(event);
      }
      if (newProgram) {
        execution.push(newProgram);
      }
      if (didPop) {
        execution.pop();
      }
      log = logScanner.next();
    }
  }

  // Main log handler. Returns a three element array of the event, the
  // next program that was invoked for CPI, and a boolean indicating if
  // a program has completed execution (and thus should be popped off the
  // execution stack).
  private handleLog(
    execution: ExecutionContext,
    log: string
  ): [Event | null, string | null, boolean] {
    // Executing program is this program.
    if (
      execution.stack.length > 0 &&
      execution.program() === this.programId.toString()
    ) {
      return this.handleProgramLog(log);
    }
    // Executing program is not this program.
    else {
      return [null, ...this.handleSystemLog(log)];
    }
  }

  // Handles logs from *this* program.
  private handleProgramLog(
    log: string
  ): [Event | null, string | null, boolean] {
    // This is a `msg!` log.
    if (log.startsWith("Program log:")) {
      const logStr = log.slice(LOG_START_INDEX);
      try {
        const event = this.coder.events.decode(logStr);
        return [event as Event, null, false];
      } catch (e) {
        return [null, null, false];
      }
    }
    // System log.
    else {
      return [null, ...this.handleSystemLog(log)];
    }
  }

  // Handles logs when the current program being executing is *not* this.
  private handleSystemLog(log: string): [string | null, boolean] {
    // System component.
    const logStart = log.split(":")[0];
    invariant(logStart, "log start");

    // Did the program finish executing?
    if (logStart.match(/^Program (.*) success/g) !== null) {
      return [null, true];
      // Recursive call.
    } else if (
      logStart.startsWith(`Program ${this.programId.toString()} invoke`)
    ) {
      return [this.programId.toString(), false];
    }
    // CPI call.
    else if (logStart.includes("invoke")) {
      return ["cpi", false]; // Any string will do.
    } else {
      return [null, false];
    }
  }
}

// Stack frame execution context, allowing one to track what program is
// executing for a given log.
class ExecutionContext {
  stack: string[];

  constructor(log: string) {
    // Assumes the first log in every transaction is an `invoke` log from the
    // runtime.
    const program = /^Program (.*) invoke.*$/g.exec(log)?.[1];
    invariant(program, "program");
    this.stack = [program];
  }

  program(): string {
    invariant(this.stack.length > 0, "STACK");
    const last = this.stack[this.stack.length - 1];
    invariant(last, "empty program stack");
    return last;
  }

  push(newProgram: string) {
    this.stack.push(newProgram);
  }

  pop() {
    invariant(this.stack.length > 0, "STACK");
    this.stack.pop();
  }
}

class LogScanner {
  constructor(public logs: string[]) {}

  next(): string | null {
    if (this.logs.length === 0) {
      return null;
    }
    const l = this.logs[0];
    this.logs = this.logs.slice(1);
    return l ?? null;
  }
}
