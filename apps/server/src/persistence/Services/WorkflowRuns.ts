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
import type * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export { WorkflowRunIntent };

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
  /** Count live (running/suspended/sleeping/paused) runs of one origin for one launching thread
   * — the per-thread ephemeral run-count cap. */
  readonly countLiveByOrigin: (
    input: CountLiveWorkflowRunsByOriginInput,
  ) => Effect.Effect<number, ProjectionRepositoryError>;
  /** Flip to `sleeping` and record the wake deadline + `waitUntil` correlation (Epic 27). */
  readonly setSleeping: (
    input: SetWorkflowRunSleepingInput,
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
>()("t3/persistence/Services/WorkflowRuns/WorkflowRunRepository") {}
