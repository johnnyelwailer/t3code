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
 * this module only persists. The SQL implementation below is its only binding.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import * as Struct from "effect/Struct";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlSchema from "effect/sql/SqlSchema";

import { IsoDateTime } from "@t3tools/contracts";
import { toPersistenceSqlError, type ProjectionRepositoryError } from "./Errors.ts";

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

// The JSON columns (`params_json`, `payload_json`) decode back to their domain shapes on read —
// the same mapFields override pattern as `WorkflowRunDbRow` in WorkflowRuns.ts.
const SignalRegistrationDbRow = SignalRegistration.mapFields(
  Struct.assign({
    params: Schema.fromJsonString(Schema.Unknown),
  }),
);

const SignalInboxDbRow = SignalInboxEntry.mapFields(
  Struct.assign({
    payload: Schema.fromJsonString(Schema.Unknown),
    // SQLite has no boolean type: the `delivered` 0/1 flag round-trips as an INTEGER, so the
    // row decode maps it back to the domain's boolean.
    delivered: Schema.Number.pipe(
      Schema.decodeTo(
        Schema.Boolean,
        SchemaTransformation.transformEffect({
          decode: (value) => Effect.succeed(value === 1),
          encode: (value) => Effect.succeed(value ? 1 : 0),
        }),
      ),
    ),
  }),
);

const makeWorkflowSignalStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRegistrationRow = SqlSchema.void({
    Request: UpsertSignalRegistrationInput,
    execute: ({ runId, sourceName, paramsHash, params, registeredAt }) =>
      sql`
        INSERT INTO workflow_signal_registrations (
          run_id, source_name, params_hash, params_json, registered_at
        )
        VALUES (${runId}, ${sourceName}, ${paramsHash}, ${JSON.stringify(params)}, ${registeredAt})
        ON CONFLICT (run_id, source_name, params_hash)
        DO UPDATE SET params_json = excluded.params_json
      `,
  });

  const listRegistrationsByInstanceRow = SqlSchema.findAll({
    Request: ListSignalRegistrationsInput,
    Result: SignalRegistrationDbRow,
    execute: ({ sourceName, paramsHash }) =>
      sql`
        SELECT
          run_id AS "runId",
          source_name AS "sourceName",
          params_hash AS "paramsHash",
          params_json AS "params",
          registered_at AS "registeredAt"
        FROM workflow_signal_registrations
        WHERE source_name = ${sourceName} AND params_hash = ${paramsHash}
        ORDER BY run_id ASC
      `,
  });

  // The reconciler's desired-instance input: every binding whose run is still in the live set
  // (a terminal run's binding must not keep its source instance alive).
  const listLiveRegistrationsRow = SqlSchema.findAll({
    Request: Schema.Struct({}),
    Result: SignalRegistrationDbRow,
    execute: () =>
      sql`
        SELECT
          r.run_id AS "runId",
          r.source_name AS "sourceName",
          r.params_hash AS "paramsHash",
          r.params_json AS "params",
          r.registered_at AS "registeredAt"
        FROM workflow_signal_registrations r
        WHERE r.run_id IN (
          SELECT run_id FROM workflow_runs
          WHERE status IN ('queued', 'running', 'suspended', 'sleeping', 'watching', 'paused')
        )
        ORDER BY r.source_name ASC, r.params_hash ASC, r.run_id ASC
      `,
  });

  // Terminal cleanup: drop bindings whose run left the live set (the reconciler's periodic
  // sweep calls this — a terminal run must not keep its source instance alive).
  const purgeTerminalRegistrationsRow = SqlSchema.void({
    Request: Schema.Struct({}),
    execute: () =>
      sql`
        DELETE FROM workflow_signal_registrations
        WHERE run_id NOT IN (
          SELECT run_id FROM workflow_runs
          WHERE status IN ('queued', 'running', 'suspended', 'sleeping', 'watching', 'paused')
        )
      `,
  });

  const insertInboxEntryRow = SqlSchema.findOne({
    Request: InsertSignalInboxEntryInput,
    Result: Schema.Struct({ id: Schema.Number }),
    execute: ({ sourceName, paramsHash, signalName, key, payload, createdAt }) =>
      sql`
        INSERT INTO workflow_signal_inbox (
          source_name, params_hash, signal_name, key, payload_json, delivered, created_at
        )
        VALUES (${sourceName}, ${paramsHash}, ${signalName}, ${key}, ${JSON.stringify(payload)}, 0, ${createdAt})
        RETURNING id
      `,
  });

  // First-wins: atomically mark + read the OLDEST open slot for the awaited tuple. A
  // concurrent take for the same tuple gets the next slot (or none), never a double delivery.
  const takeOpenInboxEntryRow = SqlSchema.findOneOption({
    Request: TakeOpenSignalInboxEntryInput,
    Result: SignalInboxDbRow,
    execute: ({ sourceName, paramsHash, signalName, key, deliveredAt }) =>
      sql`
        UPDATE workflow_signal_inbox
        SET delivered = 1, delivered_at = ${deliveredAt}
        WHERE id = (
          SELECT id FROM workflow_signal_inbox
          WHERE source_name = ${sourceName}
            AND params_hash = ${paramsHash}
            AND signal_name = ${signalName}
            AND key = ${key}
            AND delivered = 0
          ORDER BY id ASC
          LIMIT 1
        )
        RETURNING
          id,
          source_name AS "sourceName",
          params_hash AS "paramsHash",
          signal_name AS "signalName",
          key,
          payload_json AS "payload",
          delivered,
          created_at AS "createdAt",
          delivered_at AS "deliveredAt"
      `,
  });

  const deleteDeliveredInboxEntriesOlderThanRow = SqlSchema.void({
    Request: Schema.Struct({ cutoffIso: Schema.String }),
    execute: ({ cutoffIso }) =>
      sql`
        DELETE FROM workflow_signal_inbox
        WHERE delivered = 1 AND delivered_at IS NOT NULL AND delivered_at < ${cutoffIso}
      `,
  });

  const getCursorRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ instanceKey: Schema.String }),
    Result: SignalCursor,
    execute: ({ instanceKey }) =>
      sql`
        SELECT
          instance_key AS "instanceKey",
          cursor_value AS "cursorValue",
          updated_at AS "updatedAt"
        FROM workflow_signal_cursors
        WHERE instance_key = ${instanceKey}
      `,
  });

  const upsertCursorRow = SqlSchema.void({
    Request: SignalCursor,
    execute: ({ instanceKey, cursorValue, updatedAt }) =>
      sql`
        INSERT INTO workflow_signal_cursors (instance_key, cursor_value, updated_at)
        VALUES (${instanceKey}, ${cursorValue}, ${updatedAt})
        ON CONFLICT (instance_key)
        DO UPDATE SET cursor_value = excluded.cursor_value, updated_at = excluded.updated_at
      `,
  });

  const upsertRegistration: WorkflowSignalStoreShape["upsertRegistration"] = (input) =>
    upsertRegistrationRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowSignalStore.upsertRegistration:query")),
    );

  const listRegistrationsByInstance: WorkflowSignalStoreShape["listRegistrationsByInstance"] = (
    input,
  ) =>
    listRegistrationsByInstanceRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("WorkflowSignalStore.listRegistrationsByInstance:query"),
      ),
    );

  const listLiveRegistrations: WorkflowSignalStoreShape["listLiveRegistrations"] = () =>
    listLiveRegistrationsRow({}).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowSignalStore.listLiveRegistrations:query")),
    );

  const purgeTerminalRegistrations: WorkflowSignalStoreShape["purgeTerminalRegistrations"] = () =>
    purgeTerminalRegistrationsRow({}).pipe(
      Effect.mapError(
        toPersistenceSqlError("WorkflowSignalStore.purgeTerminalRegistrations:query"),
      ),
    );

  const insertInboxEntry: WorkflowSignalStoreShape["insertInboxEntry"] = (input) =>
    insertInboxEntryRow(input).pipe(
      Effect.map((row) => row.id),
      Effect.mapError(toPersistenceSqlError("WorkflowSignalStore.insertInboxEntry:query")),
    );

  const takeOpenInboxEntry: WorkflowSignalStoreShape["takeOpenInboxEntry"] = (input) =>
    takeOpenInboxEntryRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowSignalStore.takeOpenInboxEntry:query")),
    );

  const deleteDeliveredInboxEntriesOlderThan: WorkflowSignalStoreShape["deleteDeliveredInboxEntriesOlderThan"] =
    (cutoffIso) =>
      deleteDeliveredInboxEntriesOlderThanRow({ cutoffIso }).pipe(
        Effect.mapError(
          toPersistenceSqlError("WorkflowSignalStore.deleteDeliveredInboxEntriesOlderThan:query"),
        ),
      );

  const getCursor: WorkflowSignalStoreShape["getCursor"] = (instanceKey) =>
    getCursorRow({ instanceKey }).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowSignalStore.getCursor:query")),
    );

  const upsertCursor: WorkflowSignalStoreShape["upsertCursor"] = (input) =>
    upsertCursorRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowSignalStore.upsertCursor:query")),
    );

  return {
    upsertRegistration,
    listRegistrationsByInstance,
    listLiveRegistrations,
    purgeTerminalRegistrations,
    insertInboxEntry,
    takeOpenInboxEntry,
    deleteDeliveredInboxEntriesOlderThan,
    getCursor,
    upsertCursor,
  } satisfies WorkflowSignalStoreShape;
});

export const WorkflowSignalStoreLive = Layer.effect(WorkflowSignalStore, makeWorkflowSignalStore);
