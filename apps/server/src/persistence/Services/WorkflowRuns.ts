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
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

/** Run lifecycle, mirrored from the SDK's start/suspend/complete path. `sleeping` is the
 * clock-parked sibling of `suspended` (Epic 27): a run parked on `waitUntil`, woken by the
 * scheduler at its `wake_at` rather than by an event. */
export const WorkflowRunStatus = Schema.Literals([
  "queued",
  "running",
  "suspended",
  "sleeping",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export type WorkflowRunStatus = typeof WorkflowRunStatus.Type;

/** Which ask kind a suspended run is parked on (matches the engine registry's pending kind). */
export const WorkflowRunPendingKind = Schema.Literals(["thread.turn", "user.input"]);
export type WorkflowRunPendingKind = typeof WorkflowRunPendingKind.Type;

/** How the run was launched: from a discovered recipe, or agent-authored via
 * `t3work.orchestration.run` (ephemeral — no recipe on disk, source under `.t3work-runs/`). */
export const WorkflowRunOrigin = Schema.Literals(["recipe", "ephemeral"]);
export type WorkflowRunOrigin = typeof WorkflowRunOrigin.Type;

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
  /** The wall-clock instant a `sleeping` run is due (Epic 27) — the scheduler's index. Null
   * for a run not parked on a timer. */
  wakeAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkflowRun = typeof WorkflowRun.Type;

export const GetWorkflowRunInput = Schema.Struct({ runId: Schema.String });
export type GetWorkflowRunInput = typeof GetWorkflowRunInput.Type;

export const ListWorkflowRunsByStatusInput = Schema.Struct({ status: WorkflowRunStatus });
export type ListWorkflowRunsByStatusInput = typeof ListWorkflowRunsByStatusInput.Type;

/** The N most recently updated runs, any status — backs `t3work.orchestration.status`'s list mode. */
export const ListRecentWorkflowRunsInput = Schema.Struct({ limit: Schema.Number });
export type ListRecentWorkflowRunsInput = typeof ListRecentWorkflowRunsInput.Type;

export const SetWorkflowRunStatusInput = Schema.Struct({
  runId: Schema.String,
  status: WorkflowRunStatus,
  updatedAt: IsoDateTime,
});
export type SetWorkflowRunStatusInput = typeof SetWorkflowRunStatusInput.Type;

/** Resume a paused run to the parked state encoded by its retained pending columns. */
export const ResumePausedWorkflowRunInput = Schema.Struct({
  runId: Schema.String,
  updatedAt: IsoDateTime,
});
export type ResumePausedWorkflowRunInput = typeof ResumePausedWorkflowRunInput.Type;

/** Flip a run to `suspended` and record the ask it is parked on, in one update. */
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

/** Flip a run to `sleeping` and record the timer it is parked on (Epic 27): the `wake_at`
 * deadline the scheduler arms, plus the `waitUntil` correlation the scheduler resolves on
 * fire. Clears the thread/kind pending columns (a timer park has no thread). */
export const SetWorkflowRunSleepingInput = Schema.Struct({
  runId: Schema.String,
  wakeAt: IsoDateTime,
  correlationId: Schema.String,
  updatedAt: IsoDateTime,
});
export type SetWorkflowRunSleepingInput = typeof SetWorkflowRunSleepingInput.Type;

/** Count runs of one origin still holding engine resources (running/suspended/sleeping). */
export const CountLiveWorkflowRunsByOriginInput = Schema.Struct({ origin: WorkflowRunOrigin });
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
  /** Set a run's status (without touching the pending ask). */
  readonly setStatus: (
    input: SetWorkflowRunStatusInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
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
  /** Count live (running/suspended/sleeping) runs of one origin — the ephemeral concurrency cap. */
  readonly countLiveByOrigin: (
    input: CountLiveWorkflowRunsByOriginInput,
  ) => Effect.Effect<number, ProjectionRepositoryError>;
  /** Flip to `sleeping` and record the wake deadline + `waitUntil` correlation (Epic 27). */
  readonly setSleeping: (
    input: SetWorkflowRunSleepingInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

/** WorkflowRunRepository - service tag for durable run-record persistence. */
export class WorkflowRunRepository extends Context.Service<
  WorkflowRunRepository,
  WorkflowRunRepositoryShape
>()("t3/persistence/Services/WorkflowRuns/WorkflowRunRepository") {}
