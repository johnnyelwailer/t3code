import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";

import { ModelSelection } from "@t3tools/contracts";
import { toPersistenceSqlError } from "../Errors.ts";
import {
  WorkflowRunHostToolGrant,
  ClearWorkflowRunPendingInput,
  CountLiveWorkflowRunsByOriginInput,
  GetWorkflowRunInput,
  ListRecentWorkflowRunsInput,
  ListWorkflowRunsByStatusInput,
  ResumePausedWorkflowRunInput,
  SetWorkflowRunPendingInput,
  SetWorkflowRunSleepingInput,
  SetWorkflowRunStatusInput,
  WorkflowRun,
  WorkflowRunRepository,
  type WorkflowRunRepositoryShape,
} from "../Services/WorkflowRuns.ts";

// The JSON columns (`args_json`, `model_json`) decode back to their domain shapes on read.
const WorkflowRunDbRow = WorkflowRun.mapFields(
  Struct.assign({
    args: Schema.fromJsonString(Schema.Unknown),
    modelSelection: Schema.fromJsonString(ModelSelection),
    // `host_tool_grant` decodes LENIENTLY, and the fallback is `null` — i.e. NOT granted.
    //
    // This column is read by the boot scan (`listByStatus` for suspended/sleeping/paused/queued).
    // A strict decode makes one malformed value — `'not-json'`, or valid JSON of the wrong shape —
    // fail the whole query, which aborts rehydration for EVERY run instead of for the one bad row.
    // So the failure is absorbed here, per row, in the denying direction: an unreadable grant is
    // treated exactly like a missing one, which is the safe reading of a capability record. The
    // domain type is unchanged, so callers see the same `WorkflowRunHostToolGrant | null`.
    hostToolGrant: Schema.optional(
      Schema.NullOr(Schema.fromJsonString(WorkflowRunHostToolGrant)).pipe(
        Schema.catchDecoding(() => Effect.succeed(Option.some(null))),
      ),
    ),
  }),
);

const makeWorkflowRunRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertWorkflowRunRow = SqlSchema.void({
    Request: WorkflowRun,
    execute: (row) =>
      sql`
        INSERT INTO workflow_runs (
          run_id,
          workflow_path,
          args_json,
          args_hash,
          launch_thread_id,
          project_id,
          model_json,
          runtime_mode,
          interaction_mode,
          status,
          origin,
          recipe_path,
          pending_thread_id,
          pending_correlation_id,
          pending_kind,
          failure_reason,
          failure_step,
          host_tool_grant,
          wake_at,
          created_at,
          updated_at
        )
        VALUES (
          ${row.runId},
          ${row.workflowPath},
          ${JSON.stringify(row.args)},
          ${row.argsHash},
          ${row.launchThreadId},
          ${row.projectId},
          ${JSON.stringify(row.modelSelection)},
          ${row.runtimeMode},
          ${row.interactionMode},
          ${row.status},
          ${row.origin},
          ${row.recipePath},
          ${row.pendingThreadId},
          ${row.pendingCorrelationId},
          ${row.pendingKind},
          ${row.failureReason ?? null},
          ${row.failureStep ?? null},
          ${row.hostToolGrant ? JSON.stringify(row.hostToolGrant) : null},
          ${row.wakeAt},
          ${row.createdAt},
          ${row.updatedAt}
        )
        ON CONFLICT (run_id)
        DO UPDATE SET
          workflow_path = excluded.workflow_path,
          args_json = excluded.args_json,
          args_hash = excluded.args_hash,
          launch_thread_id = excluded.launch_thread_id,
          project_id = excluded.project_id,
          model_json = excluded.model_json,
          runtime_mode = excluded.runtime_mode,
          interaction_mode = excluded.interaction_mode,
          status = excluded.status,
          origin = excluded.origin,
          recipe_path = excluded.recipe_path,
          pending_thread_id = excluded.pending_thread_id,
          pending_correlation_id = excluded.pending_correlation_id,
          pending_kind = excluded.pending_kind,
          failure_reason = excluded.failure_reason,
          failure_step = excluded.failure_step,
          host_tool_grant = excluded.host_tool_grant,
          wake_at = excluded.wake_at,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
  });

  const getWorkflowRunRow = SqlSchema.findOneOption({
    Request: GetWorkflowRunInput,
    Result: WorkflowRunDbRow,
    execute: ({ runId }) =>
      sql`
        SELECT
          run_id AS "runId",
          workflow_path AS "workflowPath",
          args_json AS "args",
          args_hash AS "argsHash",
          launch_thread_id AS "launchThreadId",
          project_id AS "projectId",
          model_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          status,
          origin,
          recipe_path AS "recipePath",
          pending_thread_id AS "pendingThreadId",
          pending_correlation_id AS "pendingCorrelationId",
          pending_kind AS "pendingKind",
          failure_reason AS "failureReason",
          failure_step AS "failureStep",
          host_tool_grant AS "hostToolGrant",
          wake_at AS "wakeAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM workflow_runs
        WHERE run_id = ${runId}
      `,
  });

  const listWorkflowRunRowsByStatus = SqlSchema.findAll({
    Request: ListWorkflowRunsByStatusInput,
    Result: WorkflowRunDbRow,
    execute: ({ status }) =>
      sql`
        SELECT
          run_id AS "runId",
          workflow_path AS "workflowPath",
          args_json AS "args",
          args_hash AS "argsHash",
          launch_thread_id AS "launchThreadId",
          project_id AS "projectId",
          model_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          status,
          origin,
          recipe_path AS "recipePath",
          pending_thread_id AS "pendingThreadId",
          pending_correlation_id AS "pendingCorrelationId",
          pending_kind AS "pendingKind",
          failure_reason AS "failureReason",
          failure_step AS "failureStep",
          host_tool_grant AS "hostToolGrant",
          wake_at AS "wakeAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM workflow_runs
        WHERE status = ${status}
        ORDER BY created_at ASC, run_id ASC
      `,
  });

  // Observability listing (t3team.orchestration.status list mode) — most recently touched runs,
  // any status, newest first. Not used for boot rehydration (that scans by status).
  const listRecentWorkflowRunRows = SqlSchema.findAll({
    Request: ListRecentWorkflowRunsInput,
    Result: WorkflowRunDbRow,
    execute: ({ limit }) =>
      sql`
        SELECT
          run_id AS "runId",
          workflow_path AS "workflowPath",
          args_json AS "args",
          args_hash AS "argsHash",
          launch_thread_id AS "launchThreadId",
          project_id AS "projectId",
          model_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          status,
          origin,
          recipe_path AS "recipePath",
          pending_thread_id AS "pendingThreadId",
          pending_correlation_id AS "pendingCorrelationId",
          pending_kind AS "pendingKind",
          failure_reason AS "failureReason",
          failure_step AS "failureStep",
          host_tool_grant AS "hostToolGrant",
          wake_at AS "wakeAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM workflow_runs
        ORDER BY updated_at DESC, run_id DESC
        LIMIT ${limit}
      `,
  });

  // The ephemeral concurrency cap's index: how many runs of one origin still hold engine
  // resources (running now, or parked and resumable).
  const countLiveWorkflowRunRowsByOrigin = SqlSchema.findAll({
    Request: CountLiveWorkflowRunsByOriginInput,
    Result: Schema.Struct({ count: Schema.Number }),
    execute: ({ origin }) =>
      sql`
        SELECT COUNT(*) AS "count"
        FROM workflow_runs
        WHERE origin = ${origin}
          AND status IN ('running', 'suspended', 'sleeping', 'paused')
      `,
  });

  const setWorkflowRunStatusRow = SqlSchema.void({
    Request: SetWorkflowRunStatusInput,
    execute: ({ runId, status, updatedAt }) =>
      sql`
        UPDATE workflow_runs
        SET status = ${status}, updated_at = ${updatedAt}
        WHERE run_id = ${runId}
          AND status != 'cancelled'
          AND (status != 'paused' OR ${status} IN ('paused', 'cancelled'))
      `,
  });

  const resumePausedWorkflowRunRow = SqlSchema.void({
    Request: ResumePausedWorkflowRunInput,
    execute: ({ runId, updatedAt }) =>
      sql`
        UPDATE workflow_runs
        SET status = CASE
              WHEN pending_kind IS NOT NULL THEN 'suspended'
              WHEN wake_at IS NOT NULL THEN 'sleeping'
              ELSE status
            END,
            updated_at = ${updatedAt}
        WHERE run_id = ${runId} AND status = 'paused'
      `,
  });

  const setWorkflowRunPendingRow = SqlSchema.void({
    Request: SetWorkflowRunPendingInput,
    execute: ({ runId, pendingThreadId, pendingCorrelationId, pendingKind, updatedAt }) =>
      sql`
        UPDATE workflow_runs
        SET status = 'suspended',
            pending_thread_id = ${pendingThreadId},
            pending_correlation_id = ${pendingCorrelationId},
            pending_kind = ${pendingKind},
            wake_at = NULL,
            updated_at = ${updatedAt}
        WHERE run_id = ${runId} AND status != 'cancelled'
      `,
  });

  // Terminal settle. The failure columns are written UNCONDITIONALLY (NULL when the caller
  // supplied none), so completing a previously failed run after a resume clears its stale reason.
  const clearWorkflowRunPendingRow = SqlSchema.void({
    Request: ClearWorkflowRunPendingInput,
    execute: ({ runId, status, updatedAt, failureReason, failureStep }) =>
      sql`
        UPDATE workflow_runs
        SET status = ${status},
            pending_thread_id = NULL,
            pending_correlation_id = NULL,
            pending_kind = NULL,
            failure_reason = ${failureReason ?? null},
            failure_step = ${failureStep ?? null},
            wake_at = NULL,
            updated_at = ${updatedAt}
        WHERE run_id = ${runId} AND status != 'cancelled'
      `,
  });

  // A timer park (Epic 27): record the wake deadline + the `waitUntil` correlation the
  // scheduler resolves on fire. A timer has no thread/kind, so those pending columns clear.
  const setWorkflowRunSleepingRow = SqlSchema.void({
    Request: SetWorkflowRunSleepingInput,
    execute: ({ runId, wakeAt, correlationId, updatedAt }) =>
      sql`
        UPDATE workflow_runs
        SET status = 'sleeping',
            wake_at = ${wakeAt},
            pending_thread_id = NULL,
            pending_correlation_id = ${correlationId},
            pending_kind = NULL,
            updated_at = ${updatedAt}
        WHERE run_id = ${runId} AND status != 'cancelled'
      `,
  });

  const upsert: WorkflowRunRepositoryShape["upsert"] = (row) =>
    upsertWorkflowRunRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.upsert:query")),
    );

  const getById: WorkflowRunRepositoryShape["getById"] = (input) =>
    getWorkflowRunRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.getById:query")),
    );

  const listByStatus: WorkflowRunRepositoryShape["listByStatus"] = (input) =>
    listWorkflowRunRowsByStatus(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.listByStatus:query")),
    );

  const listRecent: WorkflowRunRepositoryShape["listRecent"] = (input) =>
    listRecentWorkflowRunRows(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.listRecent:query")),
    );

  const countLiveByOrigin: WorkflowRunRepositoryShape["countLiveByOrigin"] = (input) =>
    countLiveWorkflowRunRowsByOrigin(input).pipe(
      Effect.map((rows) => rows[0]?.count ?? 0),
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.countLiveByOrigin:query")),
    );

  const setStatus: WorkflowRunRepositoryShape["setStatus"] = (input) =>
    setWorkflowRunStatusRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.setStatus:query")),
    );

  const resumePaused: WorkflowRunRepositoryShape["resumePaused"] = (input) =>
    resumePausedWorkflowRunRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.resumePaused:query")),
    );

  const setPending: WorkflowRunRepositoryShape["setPending"] = (input) =>
    setWorkflowRunPendingRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.setPending:query")),
    );

  const clearPending: WorkflowRunRepositoryShape["clearPending"] = (input) =>
    clearWorkflowRunPendingRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.clearPending:query")),
    );

  const setSleeping: WorkflowRunRepositoryShape["setSleeping"] = (input) =>
    setWorkflowRunSleepingRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.setSleeping:query")),
    );

  return {
    upsert,
    getById,
    listByStatus,
    listRecent,
    countLiveByOrigin,
    setStatus,
    resumePaused,
    setPending,
    clearPending,
    setSleeping,
  } satisfies WorkflowRunRepositoryShape;
});

export const WorkflowRunRepositoryLive = Layer.effect(
  WorkflowRunRepository,
  makeWorkflowRunRepository,
);
