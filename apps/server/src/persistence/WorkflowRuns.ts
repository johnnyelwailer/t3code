/**
 * WorkflowRunRepository - persistence for durable workflow-engine run records.
 *
 * Owns the `workflow_runs` table: the run record + its pending ask. This is the DATA a boot
 * rehydration needs to rebuild a suspended run's resume closure (the CODE — broker / tools /
 * llm / callbacks — is reconstructed from host layers, never persisted). `status` drives the
 * boot scan (`listByStatus("suspended")`); the `pending*` columns let the reactor resolve the
 * right run when a turn completes / the user replies (Epic 25 §Open question 2).
 *
 * @module WorkflowRunRepository
 */
import {
  IsoDateTime,
  ModelSelection,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
// The launch contract's OWN schema, not a persistence copy of it: `intent` is stored exactly as
// `t3team.orchestration.run` accepted it, so the column and the tool argument can never drift.
import { WorkflowRunIntent } from "@t3team/sdk/tools/t3teamWorkflow";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlSchema from "effect/sql/SqlSchema";

import { toPersistenceSqlError, type ProjectionRepositoryError } from "./Errors.ts";

export { WorkflowRunIntent };

/** Run lifecycle, mirrored from the SDK's start/suspend/complete path. `sleeping` is the
 * clock-parked sibling of `suspended` (Epic 27): a run parked on `waitUntil`, woken by the
 * scheduler at its `wake_at` rather than by an event. `watching` is the EVENT-parked sibling
 * (design 42): a run parked on a `signal.wait`, woken by the delivery port when the awaited
 * `(signal, key)` is delivered. */
export const WorkflowRunStatus = Schema.Literals([
  // The hidden author agent is writing this run's source; no source exists yet. Boot
  // rehydration must never launch such a row (t3team-workflowEngineRehydrate.ts).
  "authoring",
  "queued",
  "running",
  "suspended",
  "sleeping",
  "watching",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export type WorkflowRunStatus = typeof WorkflowRunStatus.Type;

/** Which ask kind a parked run is suspended on (matches the engine registry's pending kind).
 * `signal.wait` marks the design-42 event park (status `watching`), which carries no thread. */
export const WorkflowRunPendingKind = Schema.Literals(["thread.turn", "user.input", "signal.wait"]);
export type WorkflowRunPendingKind = typeof WorkflowRunPendingKind.Type;

/** How the run was launched: from a discovered recipe, or agent-authored via
 * `t3team.orchestration.run` (ephemeral — no recipe on disk, source under `.t3team-runs/`). */
export const WorkflowRunOrigin = Schema.Literals(["recipe", "ephemeral"]);
export type WorkflowRunOrigin = typeof WorkflowRunOrigin.Type;

/**
 * The host-tool bridge a run was LAUNCHED with (migration 047). Absent means the run never had
 * one, so rehydration must not hand it one — the grant is launch-time policy, not something to
 * infer from a run's shape after a restart. `toolGroups: null` is "granted, no group scoping".
 */
export const WorkflowRunHostToolGrant = Schema.Struct({
  toolGroups: Schema.NullOr(Schema.Array(Schema.String)),
});
export type WorkflowRunHostToolGrant = typeof WorkflowRunHostToolGrant.Type;

/** One branch of an any-wait park (`waitForAny`): the same `(instance, signal, key)` a
 * single-signal park records in the `watch_*` columns. */
export const WorkflowRunWatchBranch = Schema.Struct({
  source: Schema.String,
  paramsHash: Schema.String,
  signal: Schema.String,
  key: Schema.String,
});
export type WorkflowRunWatchBranch = typeof WorkflowRunWatchBranch.Type;

export const WorkflowRun = Schema.Struct({
  runId: Schema.String,
  /** Absolute path to the recipe's `.workflow.ts` — re-resolved to a WorkflowRef on boot. */
  workflowPath: Schema.String,
  /** The launch args (replayed verbatim into resumeWorkflow); stored as JSON. */
  args: Schema.Unknown,
  /** SHA-256 of canonical-JSON args — mirrors the journal's runMeta drift boundary. */
  argsHash: Schema.String,
  /** The chat the run launched from; `null` for a headless run (`thread` unbound). */
  launchThreadId: Schema.NullOr(Schema.String),
  projectId: ProjectId,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  status: WorkflowRunStatus,
  /** Launch origin — `recipe` (discovered recipe) or `ephemeral` (agent-authored, tool-launched). */
  origin: WorkflowRunOrigin,
  /** The launching recipe's directory — rehydration re-resolves the recipe's private scripts
   * from it (`resolveRecipeWorkflowScripts`). NULL for ephemeral/scriptless (or pre-043) runs. */
  recipePath: Schema.NullOr(Schema.String),
  /** The thread the current ask is parked on (a spawned thread for agent() sub-threads). */
  pendingThreadId: Schema.NullOr(Schema.String),
  /** The correlation the run is parked on — an ask reply for `suspended`, the `waitUntil` sent
   * entry for `sleeping` (the scheduler resolves this when the deadline arrives). */
  pendingCorrelationId: Schema.NullOr(Schema.String),
  pendingKind: Schema.NullOr(WorkflowRunPendingKind),
  /** Agent-facing readable reason the run failed (migration 044), written by the ONE terminal
   * failure funnel and cleared by any non-failing settle. NULL unless the run failed. Optional
   * on the domain shape so existing row builders stay valid; the column itself is nullable. */
  failureReason: Schema.optional(Schema.NullOr(Schema.String)),
  /** Where it failed — the settle phase plus the primitive in flight (migration 044). */
  failureStep: Schema.optional(Schema.NullOr(Schema.String)),
  /** The host-tool bridge this run was launched with (migration 047), replayed verbatim by boot
   * rehydration. NULL for a run launched without one, and for every pre-047 row. */
  hostToolGrant: Schema.optional(Schema.NullOr(WorkflowRunHostToolGrant)),
  /** The launch contract this run was given (migration 051): `goal` / `expectedOutcome` /
   * `guardrails`, required by `t3team.orchestration.run` and previously discarded after the
   * self-heal path read it. Kept because judging a run's OUTCOME (not just its status) needs
   * what it set out to do — see Epic 25 §Auto-report on completion. NULL for a launch that
   * carried no intent, and for every pre-051 row. */
  intent: Schema.optional(Schema.NullOr(WorkflowRunIntent)),
  /** The wall-clock instant a `sleeping` run is due (Epic 27) — the scheduler's index. Null
   * for a run not parked on a timer. */
  wakeAt: Schema.NullOr(IsoDateTime),
  /** Re-drives the host has already scheduled for this run's interrupted `thread.turn` step
   * (migration 052) — the cross-restart half of the bounded no-text retry budget. 0 for every
   * pre-052 row and for every run that never had a step re-driven. */
  turnRetries: Schema.optional(Schema.Number),
  /** The awaited (instance, signal, key) a `watching` run is parked on (design 42, migration
   * 059): the source instance identity (name + params hash) it watches, plus the signal name +
   * delivery key it joins on. NULL for every run not parked on a signal — optional on the
   * domain shape so existing row builders stay valid, exactly like `failureReason`. Instance
   * scoping matters: two different instances may emit the same (signal, key), so delivery
   * targets the exact instance a run parked on. */
  watchSourceName: Schema.optional(Schema.NullOr(Schema.String)),
  watchParamsHash: Schema.optional(Schema.NullOr(Schema.String)),
  watchSignalName: Schema.optional(Schema.NullOr(Schema.String)),
  watchSignalKey: Schema.optional(Schema.NullOr(Schema.String)),
  /** Every branch of an any-wait park (migration 079), in branch order: the `signal.waitAny`
   * correlation answers whichever lands first, replying `{ index, reply }`. The `watch_*` columns
   * above then repeat branch 0. NULL for a single-signal park and for every other run. */
  watchAny: Schema.optional(Schema.NullOr(Schema.Array(WorkflowRunWatchBranch))),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkflowRun = typeof WorkflowRun.Type;

export const GetWorkflowRunInput = Schema.Struct({ runId: Schema.String });
export type GetWorkflowRunInput = typeof GetWorkflowRunInput.Type;

export const ListWorkflowRunsByStatusInput = Schema.Struct({ status: WorkflowRunStatus });
export type ListWorkflowRunsByStatusInput = typeof ListWorkflowRunsByStatusInput.Type;

/** The N most recently updated runs, any status — backs `t3team.orchestration.status`'s list mode. */
export const ListRecentWorkflowRunsInput = Schema.Struct({ limit: Schema.Number });
export type ListRecentWorkflowRunsInput = typeof ListRecentWorkflowRunsInput.Type;

/**
 * Non-terminal statuses the one-launch guard must read for the calling thread.
 * `authoring`/`queued`/`running`/`suspended` block a second launch; `paused`/
 * `sleeping`/`watching` do not, but `replaceRunId` still has to find them.
 * A global `ORDER BY updated_at LIMIT` hides a live row once enough other runs
 * move, so the guard queries this set by launch thread instead.
 */
const WORKFLOW_RUN_NON_TERMINAL_STATUSES = [
  "authoring",
  "queued",
  "running",
  "suspended",
  "sleeping",
  "watching",
  "paused",
] as const;

export const ListLiveWorkflowRunsByLaunchThreadInput = Schema.Struct({
  launchThreadId: Schema.String,
});
export type ListLiveWorkflowRunsByLaunchThreadInput =
  typeof ListLiveWorkflowRunsByLaunchThreadInput.Type;

export const SetWorkflowRunStatusInput = Schema.Struct({
  runId: Schema.String,
  status: WorkflowRunStatus,
  updatedAt: IsoDateTime,
});
export type SetWorkflowRunStatusInput = typeof SetWorkflowRunStatusInput.Type;

/** Compare-and-set status transition (GHE #411 §1): the UPDATE only takes effect when the row's
 * CURRENT status is one of `expectedStatuses` — closing the TOCTOU window between the control
 * path's read and its write, where a run that settles (completes/fails) in between must not be
 * silently flipped to `paused`/`cancelled` by a stale caller. */
export const CasSetWorkflowRunStatusInput = Schema.Struct({
  runId: Schema.String,
  status: WorkflowRunStatus,
  updatedAt: IsoDateTime,
  expectedStatuses: Schema.Array(WorkflowRunStatus),
});
export type CasSetWorkflowRunStatusInput = typeof CasSetWorkflowRunStatusInput.Type;

/** Resume a paused run to the parked state encoded by its retained pending columns. */
export const ResumePausedWorkflowRunInput = Schema.Struct({
  runId: Schema.String,
  updatedAt: IsoDateTime,
});
export type ResumePausedWorkflowRunInput = typeof ResumePausedWorkflowRunInput.Type;

/** Correct a run's launch args after a same-run repair (input-contract fault): rewrites
 * `args`/`argsHash` only — status, pending, and every other column are untouched. `argsHash`
 * mirrors the hash computed at launch (see `buildRunningWorkflowRunRow`), so a later boot
 * rehydration or status read sees a row that looks exactly like it was launched this way. */
export const UpdateWorkflowRunArgsInput = Schema.Struct({
  runId: Schema.String,
  args: Schema.Unknown,
  argsHash: Schema.String,
  updatedAt: IsoDateTime,
});
export type UpdateWorkflowRunArgsInput = typeof UpdateWorkflowRunArgsInput.Type;

/** Flip a run to `suspended` and record the ask it is parked on, in one update. Also clears the
 * failure columns: a run parking on an ask is live again, so a reason recorded by an earlier
 * failure (a re-driven step, a journal resume) must not be reported for it any more. */
export const SetWorkflowRunPendingInput = Schema.Struct({
  runId: Schema.String,
  pendingThreadId: Schema.String,
  pendingCorrelationId: Schema.String,
  pendingKind: WorkflowRunPendingKind,
  updatedAt: IsoDateTime,
});
export type SetWorkflowRunPendingInput = typeof SetWorkflowRunPendingInput.Type;

/** Clear the pending ask and set a (typically terminal) status, in one update. A failing settle
 * also records WHY here; a non-failing settle omits both and the columns are reset to NULL, so a
 * later successful resume never leaves a stale reason behind. */
export const ClearWorkflowRunPendingInput = Schema.Struct({
  runId: Schema.String,
  status: WorkflowRunStatus,
  updatedAt: IsoDateTime,
  failureReason: Schema.optional(Schema.String),
  failureStep: Schema.optional(Schema.String),
});
export type ClearWorkflowRunPendingInput = typeof ClearWorkflowRunPendingInput.Type;

/** Compare-and-set variant of {@link ClearWorkflowRunPendingInput} (GHE #411 §1): the stop path's
 * CAS guard — the UPDATE only takes effect when the row's CURRENT status is one of
 * `expectedStatuses` (a non-terminal status), so a run that finished between the control path's
 * read and its write is not overwritten with `cancelled`. */
export const CasClearWorkflowRunPendingInput = Schema.Struct({
  runId: Schema.String,
  status: WorkflowRunStatus,
  updatedAt: IsoDateTime,
  expectedStatuses: Schema.Array(WorkflowRunStatus),
  failureReason: Schema.optional(Schema.String),
  failureStep: Schema.optional(Schema.String),
});
export type CasClearWorkflowRunPendingInput = typeof CasClearWorkflowRunPendingInput.Type;

/** Mark a run `failed` while KEEPING its pending ask (GHE #403). A host-detected step failure —
 * an agent turn that died or never answered — leaves nothing wrong with the body, only an ask
 * that was not answered; retaining `pending_*` lets `t3team.orchestration.resume` re-drive that
 * exact step instead of replaying into a `sent` entry nobody will ever settle. */
export const MarkWorkflowRunFailedInput = Schema.Struct({
  runId: Schema.String,
  updatedAt: IsoDateTime,
  failureReason: Schema.String,
  failureStep: Schema.String,
});
export type MarkWorkflowRunFailedInput = typeof MarkWorkflowRunFailedInput.Type;

/** Flip a run to `sleeping` and record the timer it is parked on (Epic 27): the `wake_at`
 * deadline the scheduler arms, plus the `waitUntil` correlation the scheduler resolves on
 * fire. Clears the thread/kind pending columns (a timer park has no thread). */
export const SetWorkflowRunSleepingInput = Schema.Struct({
  runId: Schema.String,
  wakeAt: IsoDateTime,
  correlationId: Schema.String,
  updatedAt: IsoDateTime,
});

/** Flip a run to `watching` and record the signal it is parked on (design 42): the
 * `signal.wait` correlation the delivery port resolves on delivery, plus the awaited
 * `(signal, key)` it joins on. Clears the thread pending column (a signal park has no
 * thread) and the timer column (a signal park has no deadline). */
export const SetWorkflowRunWatchingInput = Schema.Struct({
  runId: Schema.String,
  correlationId: Schema.String,
  watchSourceName: Schema.String,
  watchParamsHash: Schema.String,
  watchSignalName: Schema.String,
  watchSignalKey: Schema.String,
  /** Present for an any-wait park: every branch, in branch order (see `WorkflowRun.watchAny`). */
  watchAny: Schema.optional(Schema.Array(WorkflowRunWatchBranch)),
  updatedAt: IsoDateTime,
});
export type SetWorkflowRunWatchingInput = typeof SetWorkflowRunWatchingInput.Type;

/** Journal a re-drive attempt for the run's interrupted `thread.turn` step (migration 052) —
 * the counter the bounded no-text retry budget reads and writes, so a second restart does not
 * reset it. */
export const SetWorkflowRunTurnRetriesInput = Schema.Struct({
  runId: Schema.String,
  turnRetries: Schema.Number,
  updatedAt: IsoDateTime,
});
export type SetWorkflowRunTurnRetriesInput = typeof SetWorkflowRunTurnRetriesInput.Type;
export type SetWorkflowRunSleepingInput = typeof SetWorkflowRunSleepingInput.Type;

/** Count runs of one origin still holding engine resources (running/suspended/sleeping/paused),
 * scoped to one launching thread — the ephemeral run-count cap is per-caller (one agent thread
 * looping launch→suspend/sleep→pause), not a single server-wide budget shared by every thread. */
export const CountLiveWorkflowRunsByOriginInput = Schema.Struct({
  origin: WorkflowRunOrigin,
  launchThreadId: Schema.String,
});
export type CountLiveWorkflowRunsByOriginInput = typeof CountLiveWorkflowRunsByOriginInput.Type;

/** WorkflowRunRepositoryShape - service API for durable run records. */
export interface WorkflowRunRepositoryShape {
  /** Insert or replace a run row (keyed by `runId`). */
  readonly upsert: (row: WorkflowRun) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Read a run row by id. */
  readonly getById: (
    input: GetWorkflowRunInput,
  ) => Effect.Effect<Option.Option<WorkflowRun>, ProjectionRepositoryError>;
  /** All run rows in a given status (boot rehydration reads `"suspended"`). */
  readonly listByStatus: (
    input: ListWorkflowRunsByStatusInput,
  ) => Effect.Effect<ReadonlyArray<WorkflowRun>, ProjectionRepositoryError>;
  /** The N most recently updated runs, any status (observability listing, not boot rehydration). */
  readonly listRecent: (
    input: ListRecentWorkflowRunsInput,
  ) => Effect.Effect<ReadonlyArray<WorkflowRun>, ProjectionRepositoryError>;
  /** This launch thread's non-terminal runs, ignoring how recently other threads updated. */
  readonly listLiveByLaunchThread: (
    input: ListLiveWorkflowRunsByLaunchThreadInput,
  ) => Effect.Effect<ReadonlyArray<WorkflowRun>, ProjectionRepositoryError>;
  /** Set a run's status (without touching the pending ask). */
  readonly setStatus: (
    input: SetWorkflowRunStatusInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Compare-and-set status transition: writes only when the row's current status is one of
   * `expectedStatuses`, and reports whether a row was actually affected. Callers whose write did
   * not land must re-read the row to explain why (it likely already settled). */
  readonly casSetStatus: (
    input: CasSetWorkflowRunStatusInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;
  /** Restore `paused` to `suspended` or `sleeping` without losing its parked continuation. */
  readonly resumePaused: (
    input: ResumePausedWorkflowRunInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Flip to `suspended` and record the pending ask (fired when an ask verb suspends). */
  readonly setPending: (
    input: SetWorkflowRunPendingInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Clear the pending ask and set the given status (on resume completion/failure). */
  readonly clearPending: (
    input: ClearWorkflowRunPendingInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Compare-and-set variant of {@link clearPending}: writes only when the row's current status
   * is one of `expectedStatuses`, and reports whether a row was actually affected. */
  readonly casClearPending: (
    input: CasClearWorkflowRunPendingInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;
  /** Mark `failed` but keep the pending ask — a host-detected step failure `resume` can re-drive. */
  readonly markFailedRetainingPending: (
    input: MarkWorkflowRunFailedInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Count live (running/suspended/sleeping/watching/paused) runs of one origin for one
   * launching thread — the per-thread ephemeral run-count cap. */
  readonly countLiveByOrigin: (
    input: CountLiveWorkflowRunsByOriginInput,
  ) => Effect.Effect<number, ProjectionRepositoryError>;
  /** Flip to `sleeping` and record the wake deadline + `waitUntil` correlation (Epic 27). */
  readonly setSleeping: (
    input: SetWorkflowRunSleepingInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Flip to `watching` and record the awaited `(signal, key)` + `signal.wait` correlation
   * (design 42). */
  readonly setWatching: (
    input: SetWorkflowRunWatchingInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Journal a re-drive attempt for the run's interrupted step (the cross-restart counter). */
  readonly setTurnRetries: (
    input: SetWorkflowRunTurnRetriesInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Correct a run's persisted launch args after a same-run repair (input-contract fault). */
  readonly updateArgs: (
    input: UpdateWorkflowRunArgsInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

/** WorkflowRunRepository - service tag for durable run-record persistence. */
export class WorkflowRunRepository extends Context.Service<
  WorkflowRunRepository,
  WorkflowRunRepositoryShape
>()("t3/persistence/WorkflowRuns/WorkflowRunRepository") {}

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
    // `intent_json` decodes LENIENTLY to `null` for the same reason as `host_tool_grant` above:
    // the boot scan reads every row, so one unreadable intent must degrade that ONE run's report
    // to "outcome unknown" rather than abort rehydration for all of them. The denying direction
    // here is "no recorded intent", which is exactly what a pre-051 row looks like.
    intent: Schema.optional(
      Schema.NullOr(Schema.fromJsonString(WorkflowRunIntent)).pipe(
        Schema.catchDecoding(() => Effect.succeed(Option.some(null))),
      ),
    ),
    // `watch_signal_*` (migration 059) are plain nullable TEXT: no JSON round-trip, no decode
    // hazard — an unreadable value cannot exist, only a set or unset pair.
    // `watch_any_json` decodes LENIENTLY to `null`, like `host_tool_grant`: one unreadable branch
    // list must not abort the boot scan for every run. Such a row then reads as a single-signal
    // park on branch 0, whose raw-payload reply the any-wait refuses loudly on resume.
    watchAny: Schema.optional(
      Schema.NullOr(Schema.fromJsonString(Schema.Array(WorkflowRunWatchBranch))).pipe(
        Schema.catchDecoding(() => Effect.succeed(Option.some(null))),
      ),
    ),
  }),
);

const makeWorkflowRunRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The launch upsert (the only writer of `turn_retries` in this shape): it runs at
  // `recordRunning`, when a run has no re-drives yet, so `turn_retries` inserts its NOT NULL
  // default 0 — post-launch transitions use the targeted UPDATEs below, which leave the
  // journaled budget untouched (migration 052).
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
          intent_json,
          wake_at,
          turn_retries,
          watch_source_name,
          watch_params_hash,
          watch_signal_name,
          watch_signal_key,
          watch_any_json,
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
          ${row.intent ? JSON.stringify(row.intent) : null},
          ${row.wakeAt},
          ${row.turnRetries ?? 0},
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
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
          intent_json = excluded.intent_json,
          wake_at = excluded.wake_at,
          turn_retries = excluded.turn_retries,
          watch_source_name = NULL,
          watch_params_hash = NULL,
          watch_signal_name = NULL,
          watch_signal_key = NULL,
          watch_any_json = NULL,
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
          intent_json AS "intent",
          wake_at AS "wakeAt",
          turn_retries AS "turnRetries",
          watch_source_name AS "watchSourceName",
          watch_params_hash AS "watchParamsHash",
          watch_signal_name AS "watchSignalName",
          watch_signal_key AS "watchSignalKey",
          watch_any_json AS "watchAny",
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
          intent_json AS "intent",
          wake_at AS "wakeAt",
          turn_retries AS "turnRetries",
          watch_source_name AS "watchSourceName",
          watch_params_hash AS "watchParamsHash",
          watch_signal_name AS "watchSignalName",
          watch_signal_key AS "watchSignalKey",
          watch_any_json AS "watchAny",
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
          intent_json AS "intent",
          wake_at AS "wakeAt",
          turn_retries AS "turnRetries",
          watch_source_name AS "watchSourceName",
          watch_params_hash AS "watchParamsHash",
          watch_signal_name AS "watchSignalName",
          watch_signal_key AS "watchSignalKey",
          watch_any_json AS "watchAny",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM workflow_runs
        ORDER BY updated_at DESC, run_id DESC
        LIMIT ${limit}
      `,
  });

  const listLiveWorkflowRunsByLaunchThread = SqlSchema.findAll({
    Request: ListLiveWorkflowRunsByLaunchThreadInput,
    Result: WorkflowRunDbRow,
    execute: ({ launchThreadId }) =>
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
          intent_json AS "intent",
          wake_at AS "wakeAt",
          turn_retries AS "turnRetries",
          watch_source_name AS "watchSourceName",
          watch_params_hash AS "watchParamsHash",
          watch_signal_name AS "watchSignalName",
          watch_signal_key AS "watchSignalKey",
          watch_any_json AS "watchAny",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM workflow_runs
        WHERE launch_thread_id = ${launchThreadId}
          AND ${sql.in("status", WORKFLOW_RUN_NON_TERMINAL_STATUSES)}
        ORDER BY updated_at DESC, run_id DESC
      `,
  });

  // The ephemeral run-count cap's index: how many runs of one origin, launched from one thread,
  // still hold engine resources (running now, or parked and resumable). Scoped to
  // `launch_thread_id` so the cap is per-caller, not one budget shared by every thread on the
  // server.
  const countLiveWorkflowRunRowsByOrigin = SqlSchema.findAll({
    Request: CountLiveWorkflowRunsByOriginInput,
    Result: Schema.Struct({ count: Schema.Number }),
    execute: ({ origin, launchThreadId }) =>
      sql`
        SELECT COUNT(*) AS "count"
        FROM workflow_runs
        WHERE origin = ${origin}
          AND launch_thread_id = ${launchThreadId}
          AND status IN ('running', 'suspended', 'sleeping', 'watching', 'paused')
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

  // Compare-and-set (GHE #411 §1): the UPDATE only fires when the row's CURRENT status is one of
  // `expectedStatuses`, and `RETURNING run_id` reports whether it did — closing the TOCTOU window
  // between a control action's read and its write (a run that settled in between is left alone).
  const casSetWorkflowRunStatusRow = SqlSchema.findOneOption({
    Request: CasSetWorkflowRunStatusInput,
    Result: Schema.Struct({ runId: Schema.String }),
    execute: ({ runId, status, updatedAt, expectedStatuses }) =>
      sql`
        UPDATE workflow_runs
        SET status = ${status}, updated_at = ${updatedAt}
        WHERE run_id = ${runId} AND ${sql.in("status", expectedStatuses)}
        RETURNING run_id AS "runId"
      `,
  });

  const casClearWorkflowRunPendingRow = SqlSchema.findOneOption({
    Request: CasClearWorkflowRunPendingInput,
    Result: Schema.Struct({ runId: Schema.String }),
    execute: ({ runId, status, updatedAt, failureReason, failureStep, expectedStatuses }) =>
      sql`
        UPDATE workflow_runs
        SET status = ${status},
            pending_thread_id = NULL,
            pending_correlation_id = NULL,
            pending_kind = NULL,
            failure_reason = ${failureReason ?? null},
            failure_step = ${failureStep ?? null},
            wake_at = NULL,
            watch_source_name = NULL,
            watch_params_hash = NULL,
            watch_signal_name = NULL,
            watch_signal_key = NULL,
            watch_any_json = NULL,
            updated_at = ${updatedAt}
        WHERE run_id = ${runId} AND ${sql.in("status", expectedStatuses)}
        RETURNING run_id AS "runId"
      `,
  });

  const resumePausedWorkflowRunRow = SqlSchema.void({
    Request: ResumePausedWorkflowRunInput,
    execute: ({ runId, updatedAt }) =>
      sql`
        UPDATE workflow_runs
        SET status = CASE
              WHEN pending_kind = 'signal.wait' THEN 'watching'
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
            watch_source_name = NULL,
            watch_params_hash = NULL,
            watch_signal_name = NULL,
            watch_signal_key = NULL,
            watch_any_json = NULL,
            failure_reason = NULL,
            failure_step = NULL,
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
            watch_source_name = NULL,
            watch_params_hash = NULL,
            watch_signal_name = NULL,
            watch_signal_key = NULL,
            watch_any_json = NULL,
            updated_at = ${updatedAt}
        WHERE run_id = ${runId} AND status != 'cancelled'
      `,
  });

  // A host-detected step failure (GHE #403): terminal `failed` + the reason, but the pending
  // ask stays so `t3team.orchestration.resume` can re-drive that step. `wake_at` is left alone
  // too — a `thread.turn` park never has one.
  const markWorkflowRunFailedRow = SqlSchema.void({
    Request: MarkWorkflowRunFailedInput,
    execute: ({ runId, updatedAt, failureReason, failureStep }) =>
      sql`
        UPDATE workflow_runs
        SET status = 'failed',
            failure_reason = ${failureReason},
            failure_step = ${failureStep},
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
            watch_source_name = NULL,
            watch_params_hash = NULL,
            watch_signal_name = NULL,
            watch_signal_key = NULL,
            watch_any_json = NULL,
            updated_at = ${updatedAt}
        WHERE run_id = ${runId} AND status != 'cancelled'
      `,
  });

  // An event park (design 42): the `signal.wait` correlation the delivery port resolves on
  // delivery + the awaited `(instance, signal, key)` it joins on. A signal has no thread and no
  // timer, so those columns clear.
  const setWorkflowRunWatchingRow = SqlSchema.void({
    Request: SetWorkflowRunWatchingInput,
    execute: ({
      runId,
      correlationId,
      watchSourceName,
      watchParamsHash,
      watchSignalName,
      watchSignalKey,
      watchAny,
      updatedAt,
    }) =>
      sql`
        UPDATE workflow_runs
        SET status = 'watching',
            pending_thread_id = NULL,
            pending_correlation_id = ${correlationId},
            pending_kind = 'signal.wait',
            wake_at = NULL,
            watch_source_name = ${watchSourceName},
            watch_params_hash = ${watchParamsHash},
            watch_signal_name = ${watchSignalName},
            watch_signal_key = ${watchSignalKey},
            watch_any_json = ${watchAny === undefined ? null : JSON.stringify(watchAny)},
            updated_at = ${updatedAt}
        WHERE run_id = ${runId} AND status != 'cancelled'
      `,
  });

  // Journal a re-drive attempt for the run's interrupted thread.turn step (migration 052).
  // A targeted UPDATE — status and the pending ask stay untouched, the run stays `suspended`.
  const setWorkflowRunTurnRetriesRow = SqlSchema.void({
    Request: SetWorkflowRunTurnRetriesInput,
    execute: ({ runId, turnRetries, updatedAt }) =>
      sql`
        UPDATE workflow_runs
        SET turn_retries = ${turnRetries}, updated_at = ${updatedAt}
        WHERE run_id = ${runId} AND status != 'cancelled'
      `,
  });

  // Input-contract repair (a same-run correction, never the launch path): rewrites args/hash
  // only, leaving status/pending/every other column untouched. Mirrors the shape of
  // `setWorkflowRunStatusRow` above — a narrow, single-purpose UPDATE rather than a full upsert.
  const updateWorkflowRunArgsRow = SqlSchema.void({
    Request: UpdateWorkflowRunArgsInput,
    execute: ({ runId, args, argsHash, updatedAt }) =>
      sql`
        UPDATE workflow_runs
        SET args_json = ${JSON.stringify(args)},
            args_hash = ${argsHash},
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

  const listLiveByLaunchThread: WorkflowRunRepositoryShape["listLiveByLaunchThread"] = (input) =>
    listLiveWorkflowRunsByLaunchThread(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.listLiveByLaunchThread:query")),
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

  const casSetStatus: WorkflowRunRepositoryShape["casSetStatus"] = (input) =>
    casSetWorkflowRunStatusRow(input).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.casSetStatus:query")),
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

  const casClearPending: WorkflowRunRepositoryShape["casClearPending"] = (input) =>
    casClearWorkflowRunPendingRow(input).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.casClearPending:query")),
    );

  const markFailedRetainingPending: WorkflowRunRepositoryShape["markFailedRetainingPending"] = (
    input,
  ) =>
    markWorkflowRunFailedRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("WorkflowRunRepository.markFailedRetainingPending:query"),
      ),
    );

  const setSleeping: WorkflowRunRepositoryShape["setSleeping"] = (input) =>
    setWorkflowRunSleepingRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.setSleeping:query")),
    );

  const setWatching: WorkflowRunRepositoryShape["setWatching"] = (input) =>
    setWorkflowRunWatchingRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.setWatching:query")),
    );

  const setTurnRetries: WorkflowRunRepositoryShape["setTurnRetries"] = (input) =>
    setWorkflowRunTurnRetriesRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.setTurnRetries:query")),
    );

  const updateArgs: WorkflowRunRepositoryShape["updateArgs"] = (input) =>
    updateWorkflowRunArgsRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("WorkflowRunRepository.updateArgs:query")),
    );

  return {
    upsert,
    getById,
    listByStatus,
    listRecent,
    listLiveByLaunchThread,
    countLiveByOrigin,
    setStatus,
    casSetStatus,
    resumePaused,
    setPending,
    clearPending,
    casClearPending,
    markFailedRetainingPending,
    setSleeping,
    setWatching,
    setTurnRetries,
    updateArgs,
  } satisfies WorkflowRunRepositoryShape;
});

export const WorkflowRunRepositoryLive = Layer.effect(
  WorkflowRunRepository,
  makeWorkflowRunRepository,
);
