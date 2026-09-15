/**
 * WorkflowSignalStore - persistence for the signal-source durable state (GHE #332, design 42).
 *
 * Owns the three tables migration 059 creates:
 *   • `workflow_signal_registrations` — the journaled binding FACTS (one row per
 *     run × source instance). The reconciler derives the desired live source set from
 *     these rows joined to non-terminal runs; deduped by instance identity
 *     `(source_name, params_hash)`.
 *   • `workflow_signal_inbox` — durable delivery slots. A source event that lands while no
 *     run is parked on its `(signal, key)` is written here; a later `signal.wait` drain takes
 *     the matching open entry (first-wins).
 *   • `workflow_signal_cursors` — the durable per-instance cursor a push-only source
 *     remembers, so `start()`'s catch-up sweep bridges the host-down window.
 *
 * This store is DUMB CRUD: it knows no reconciliation policy, no capabilities, no run
 * statuses. The engine-side reconciler and delivery port (t3team-workflowSignal*) decide;
 * this module only persists.
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { IsoDateTime } from "@t3tools/contracts";
import type { ProjectionRepositoryError } from "../Errors.ts";

/** One run's binding to one source instance (upserted by the `signal.register` verb). */
export const SignalRegistration = Schema.Struct({
  runId: Schema.String,
  sourceName: Schema.String,
  /** Canonical-JSON hash of the validated params — the instance-identity half. */
  paramsHash: Schema.String,
  /** The validated params themselves (stored for logging + the host-side `start(ctx)`). */
  params: Schema.Unknown,
  registeredAt: IsoDateTime,
});
export type SignalRegistration = typeof SignalRegistration.Type;

export const UpsertSignalRegistrationInput = Schema.Struct({
  runId: Schema.String,
  sourceName: Schema.String,
  paramsHash: Schema.String,
  params: Schema.Unknown,
  registeredAt: IsoDateTime,
});
export type UpsertSignalRegistrationInput = typeof UpsertSignalRegistrationInput.Type;

export const ListSignalRegistrationsInput = Schema.Struct({
  sourceName: Schema.String,
  paramsHash: Schema.String,
});
export type ListSignalRegistrationsInput = typeof ListSignalRegistrationsInput.Type;

/** A durable delivery slot. `payload` is the DECODED signal payload (trusted at write time —
 * the delivery port decoded it against the signal's schema before the insert). */
export const SignalInboxEntry = Schema.Struct({
  id: Schema.Number,
  sourceName: Schema.String,
  paramsHash: Schema.String,
  signalName: Schema.String,
  key: Schema.String,
  payload: Schema.Unknown,
  delivered: Schema.Boolean,
  createdAt: IsoDateTime,
  deliveredAt: Schema.NullOr(IsoDateTime),
});
export type SignalInboxEntry = typeof SignalInboxEntry.Type;

export const InsertSignalInboxEntryInput = Schema.Struct({
  sourceName: Schema.String,
  paramsHash: Schema.String,
  signalName: Schema.String,
  key: Schema.String,
  payload: Schema.Unknown,
  createdAt: IsoDateTime,
});
export type InsertSignalInboxEntryInput = typeof InsertSignalInboxEntryInput.Type;

export const TakeOpenSignalInboxEntryInput = Schema.Struct({
  sourceName: Schema.String,
  paramsHash: Schema.String,
  signalName: Schema.String,
  key: Schema.String,
  deliveredAt: IsoDateTime,
});
export type TakeOpenSignalInboxEntryInput = typeof TakeOpenSignalInboxEntryInput.Type;

/** The durable per-instance cursor (instance key = `source:paramsHash`). */
export const SignalCursor = Schema.Struct({
  instanceKey: Schema.String,
  cursorValue: Schema.String,
  updatedAt: IsoDateTime,
});
export type SignalCursor = typeof SignalCursor.Type;

/** WorkflowSignalStoreShape - service API for the signal-source durable state. */
export interface WorkflowSignalStoreShape {
  /** Idempotent binding FACT (replay-safe): upsert the run × instance row. */
  readonly upsertRegistration: (
    input: UpsertSignalRegistrationInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** The runs bound to one source instance (the reconciler's desired-set input). */
  readonly listRegistrationsByInstance: (
    input: ListSignalRegistrationsInput,
  ) => Effect.Effect<ReadonlyArray<SignalRegistration>, ProjectionRepositoryError>;
  /** Every binding whose run is still in the live set — the reconciler's desired-instance
   * input (an instance is desired iff at least one NON-TERMINAL run holds a registration on it). */
  readonly listLiveRegistrations: () => Effect.Effect<
    ReadonlyArray<SignalRegistration>,
    ProjectionRepositoryError
    >;
  /** Drop settled runs' bindings (terminal cleanup, run by the periodic sweep). */
  readonly purgeTerminalRegistrations: () => Effect.Effect<void, ProjectionRepositoryError>;
  /** Write a durable delivery slot for an event that landed while no run was parked. */
  readonly insertInboxEntry: (
    input: InsertSignalInboxEntryInput,
  ) => Effect.Effect<number, ProjectionRepositoryError>;
  /** Atomically take the OLDEST open slot matching `(source, instance, signal, key)`;
   * `None` when none is open (first-wins — a second take for the same tuple gets nothing). */
  readonly takeOpenInboxEntry: (
    input: TakeOpenSignalInboxEntryInput,
  ) => Effect.Effect<Option.Option<SignalInboxEntry>, ProjectionRepositoryError>;
  /** GC: drop delivered slots older than the cutoff (the inbox is a bridge, not a log). */
  readonly deleteDeliveredInboxEntriesOlderThan: (
    cutoffIso: string,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getCursor: (
    instanceKey: string,
  ) => Effect.Effect<Option.Option<SignalCursor>, ProjectionRepositoryError>;
  readonly upsertCursor: (input: SignalCursor) => Effect.Effect<void, ProjectionRepositoryError>;
}

/** WorkflowSignalStore - service tag for signal-source durable-state persistence. */
export class WorkflowSignalStore extends Context.Service<
  WorkflowSignalStore,
  WorkflowSignalStoreShape
>()("t3/persistence/Services/WorkflowSignalStore") {}
