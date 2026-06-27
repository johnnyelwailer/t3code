/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * Wire-encoding for the durable journal plus the fs append primitive.
 *
 * A journaled entry has two on-disk shapes — a call/sent line ({@link toWire}) and an
 * out-of-band reply line ({@link toResolvedWire}) — both plain JSON objects. {@link FsJournalStore}
 * (the default {@link JournalStore} backend) writes one line per entry with an fsync, so the
 * entry is durable before the engine returns; a DB backend stores the same object as one row.
 * Stage-1 durability only; stage-2 atomic-rename lives behind a separate epic.
 */

import * as NodeModule from "node:module";

import type { JournalEntry } from "./t3work-sdk.journalReader.ts";
import type { PrimitiveKind } from "./t3work-sdk.types.ts";

const nodeRequire = NodeModule.createRequire(import.meta.url);
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

/** Append one already-encoded wire object to a journal file, fsync-durable before returning. */
export function appendWireLine(journalPath: string, wire: Record<string, unknown>): void {
  const fd = fs.openSync(journalPath, "a");
  try {
    fs.writeSync(fd, `${JSON.stringify(wire)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** Build the on-disk wire object for a call/sent entry. */
export function toWire(entry: JournalEntry): Record<string, unknown> {
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
export function toResolvedWire(input: ResolvedWireInput): Record<string, unknown> {
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
