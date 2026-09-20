/**
 * SQL implementation of the WorkflowSignalStore service (GHE #332, design 42).
 *
 * Three tables, all owned by migration 059:
 *   • workflow_signal_registrations (run × instance binding facts)
 *   • workflow_signal_inbox (durable delivery slots, first-wins takes)
 *   • workflow_signal_cursors (durable per-instance catch-up cursors)
 */
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import * as Struct from "effect/Struct";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  SignalCursor,
  SignalInboxEntry,
  SignalRegistration,
  UpsertSignalRegistrationInput,
  InsertSignalInboxEntryInput,
  ListSignalRegistrationsInput,
  TakeOpenSignalInboxEntryInput,
  WorkflowSignalStore,
  type WorkflowSignalStoreShape,
} from "../Services/WorkflowSignalStore.ts";

// The JSON columns (`params_json`, `payload_json`) decode back to their domain shapes on read —
// the same mapFields override pattern as `WorkflowRunDbRow` in Layers/WorkflowRuns.ts.
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
        SchemaTransformation.transformOrFail({
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
