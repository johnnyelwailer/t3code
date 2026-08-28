import type { JournalSink } from "./journalStore.ts";
import type { PrimitiveKind } from "./primitiveKinds.ts";

export type { PrimitiveKind } from "./primitiveKinds.ts";

/** A single journaled effectful operation. */
export interface PrimitiveCall<R> {
  readonly kind: PrimitiveKind;
  readonly refId: string;
  readonly args: unknown;
  readonly replay?: "default" | "never";
  readonly exec: () => Promise<R>;
  readonly decodeRecorded?: (recorded: unknown) => R | Promise<R>;
}

/** The minimal generic port used by core runtime primitives. */
export interface PrimitiveRuntime {
  readonly callPrimitive: <R>(call: PrimitiveCall<R>) => Promise<R>;
  readonly now: () => number;
  readonly random: () => number;
  readonly uuid: () => string;
}

/** Host-provided wall-clock and entropy source used by the journaled runtime. */
export interface DeterministicSource {
  readonly now: () => number;
  readonly random: () => number;
  readonly uuid: () => string;
}

/** Inputs required by the generic replay-aware primitive dispatcher. */
export interface DurablePrimitiveSeat {
  readonly journal: ReadonlyMap<number, import("./journalReader.ts").JournalEntry>;
  readonly writer: JournalSink;
  readonly filePath?: string | undefined;
  readonly nowIso: () => string;
  readonly maxRecordedSeq: number;
  readonly isBlackBoxed: () => boolean;
  readonly takeSeq: () => number;
  /** Host run id for live primitive events; absent = no primitive event emission. */
  readonly runId?: string | undefined;
  /** Live lifecycle observations; primitive started/completed events are emitted here. */
  readonly events?: import("./events.ts").WorkflowEventSink | undefined;
}
