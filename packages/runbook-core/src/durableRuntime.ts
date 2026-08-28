import * as DateTime from "effect/DateTime";

import type { JournalEntry, ResolvedEntry } from "./journalReader.ts";
import type { JournalSink } from "./journalStore.ts";
import { createHandleDispatch, type HandleDispatch } from "./handles.ts";
import {
  createDurableCallDeterministic,
  createDurableCallPrimitive,
} from "./durableRuntimePrimitive.ts";
import type {
  DeterministicSource,
  DurablePrimitiveSeat,
  PrimitiveRuntime,
} from "./runtimeTypes.ts";
import type { WorkflowEventSink } from "./events.ts";

export interface DurableRuntimeConfig {
  readonly journal: ReadonlyMap<number, JournalEntry>;
  readonly writer: JournalSink;
  /** Host clock and entropy. The body-visible values are journaled by this runtime. */
  readonly source: DeterministicSource;
  /** Host timestamp formatter, injected so adapters can keep their existing wire format. */
  readonly nowIso?: (() => string) | undefined;
  /** Absolute workflow path, included in replay-drift errors when available. */
  readonly filePath?: string | undefined;
  /** Host run id used to derive durable handle correlation ids. */
  readonly runId?: string | undefined;
  /** Resolved handle replies loaded from the durable store. */
  readonly resolved?: ReadonlyMap<string, ResolvedEntry> | undefined;
  /** Live lifecycle observations; primitive started/completed events are emitted here. */
  readonly events?: WorkflowEventSink | undefined;
}

export interface DurablePrimitiveRuntime extends PrimitiveRuntime {
  readonly currentSeq: () => number;
  readonly runBlackBoxed: <R>(fn: () => Promise<R>) => Promise<R>;
  readonly hostNow: () => number;
  readonly hostRandom: () => number;
  readonly hostUuid: () => string;
  readonly handles: HandleDispatch;
}

export function createDurableRuntime(config: DurableRuntimeConfig): DurablePrimitiveRuntime {
  let seq = 0;
  let blackBoxDepth = 0;
  const maxRecordedSeq =
    config.journal.size === 0 ? 0 : Math.max(...Array.from(config.journal.keys()));
  const resolved = new Map<string, ResolvedEntry>(config.resolved ?? []);

  const runBlackBoxed = async <R>(fn: () => Promise<R>): Promise<R> => {
    blackBoxDepth += 1;
    try {
      return await fn();
    } finally {
      blackBoxDepth -= 1;
    }
  };

  const primitiveSeat: DurablePrimitiveSeat = {
    journal: config.journal,
    writer: config.writer,
    filePath: config.filePath,
    nowIso: config.nowIso ?? (() => DateTime.formatIso(DateTime.makeUnsafe(config.source.now()))),
    maxRecordedSeq,
    isBlackBoxed: () => blackBoxDepth > 0,
    takeSeq: () => (seq += 1),
    runId: config.runId,
    events: config.events,
  };
  const callPrimitive = createDurableCallPrimitive(primitiveSeat);
  const callDeterministic = createDurableCallDeterministic(primitiveSeat);
  const now = (): number => callDeterministic("now", config.source.now);
  const random = (): number => callDeterministic("random", config.source.random);
  const uuid = (): string => callDeterministic("uuid", config.source.uuid);

  const handles = createHandleDispatch({
    runId: config.runId ?? "run",
    filePath: config.filePath,
    nowIso: primitiveSeat.nowIso,
    isBlackBoxed: () => blackBoxDepth > 0,
    takeSeq: primitiveSeat.takeSeq,
    maxRecordedSeq,
    recordedAt: (atSeq) => config.journal.get(atSeq),
    resolvedFor: (correlationId) => resolved.get(correlationId),
    writer: config.writer,
    setResolved: (entry) => resolved.set(entry.correlationId, entry),
  });

  return {
    callPrimitive,
    now,
    random,
    uuid,
    currentSeq: () => seq,
    runBlackBoxed,
    hostNow: config.source.now,
    hostRandom: config.source.random,
    hostUuid: config.source.uuid,
    handles,
  };
}
