/**
 * Append-only `journal.jsonl` writer. Holds one long-lived append fd and `fsync`s after
 * every line so the entry is durable before the engine returns. Stage-1 durability only;
 * stage-2 atomic-rename lives behind a separate epic.
 */

import { createRequire } from "node:module";

import type { JournalEntry } from "./t3work-sdk.journalReader.ts";
import type { PrimitiveKind } from "./t3work-sdk.types.ts";

const nodeRequire = createRequire(import.meta.url);
interface NodeFsModule {
  readonly openSync: (path: string, flags: string) => number;
  readonly writeSync: (fd: number, data: string) => number;
  readonly fsyncSync: (fd: number) => void;
  readonly closeSync: (fd: number) => void;
}
const fs = nodeRequire("node:fs") as NodeFsModule;

/** A settled Handle reply to append, keyed by `correlationId` (not by `seq`). */
export interface ResolvedWireInput {
  readonly correlationId: string;
  readonly kind: PrimitiveKind;
  readonly refId: string;
  /** The reply value; ignored when `dismissed` is true. */
  readonly reply?: unknown;
  /** Terminal dismissal — `.response` rejects and a later real reply is ignored. */
  readonly dismissed?: boolean;
  readonly startedAt: string;
  readonly endedAt: string;
}

export class JournalWriter {
  readonly path: string;
  private fd: number | undefined;

  constructor(journalPath: string) {
    this.path = journalPath;
    this.fd = fs.openSync(journalPath, "a");
  }

  append(entry: JournalEntry): void {
    this.writeLine(toWire(entry));
  }

  /** Append a `phase: "resolved"` line keyed by `correlationId` (the out-of-band reply). */
  appendResolved(input: ResolvedWireInput): void {
    this.writeLine(toResolvedWire(input));
  }

  private writeLine(wire: Record<string, unknown>): void {
    if (this.fd === undefined) {
      throw new Error(`JournalWriter for '${this.path}' was used after dispose().`);
    }
    fs.writeSync(this.fd, `${JSON.stringify(wire)}\n`);
    fs.fsyncSync(this.fd);
  }

  dispose(): void {
    if (this.fd !== undefined) {
      fs.closeSync(this.fd);
      this.fd = undefined;
    }
  }
}

/** Build the on-disk wire object for a call/sent entry. */
function toWire(entry: JournalEntry): Record<string, unknown> {
  const base = {
    seq: entry.seq,
    callId: entry.callId,
    kind: entry.kind,
    refId: entry.refId,
    argsHash: entry.argsHash,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
  };
  // A `sent` Handle entry carries its correlationId and NO result (the reply lands later
  // as a separate `resolved` line).
  if (entry.phase === "sent") {
    return { ...base, phase: "sent", correlationId: entry.correlationId };
  }
  if (entry.kind === "script-never") return base;
  return { ...base, result: entry.result === undefined ? { void: true } : { v: entry.result } };
}

/** Build the on-disk wire object for a `resolved` line (seq is unused for these). */
function toResolvedWire(input: ResolvedWireInput): Record<string, unknown> {
  const result = input.dismissed
    ? { dismissed: true }
    : input.reply === undefined
      ? { void: true }
      : { v: input.reply };
  return {
    seq: 0,
    callId: `resolved:${input.correlationId}`,
    kind: input.kind,
    refId: input.refId,
    argsHash: "",
    result,
    phase: "resolved",
    correlationId: input.correlationId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  };
}
