/**
 * `t3team.orchestration.status` — read-only broker tool letting an agent observe a workflow run it
 * (or another thread) launched via `t3team.orchestration.run`. With `runId`, returns that run's
 * observable state plus a one-sentence next-step hint. Without one, lists the most recent runs
 * (project-wide — the run row does not model a per-thread index, so this does not scope to the
 * calling thread; see WorkflowRunRepository.listRecent).
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type {
  WorkflowRun,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import { userFacingFailureStep } from "./t3team-workflowFailureReason.ts";

const RECENT_RUNS_LIMIT = 10;

export interface WorkflowStatusToolResult {
  readonly runId: string;
  readonly status: WorkflowRun["status"];
  readonly origin: WorkflowRun["origin"];
  readonly pendingKind?: WorkflowRun["pendingKind"] | undefined;
  readonly wakeAt?: WorkflowRun["wakeAt"] | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** WHY a `failed` run failed — readable, no stack traces or internal ids (migration 044).
   * Absent for a run that never failed, and for a pre-044 row. */
  readonly failureReason?: string | undefined;
  /** WHERE it failed — settle phase plus the primitive in flight (migration 044). */
  readonly failureStep?: string | undefined;
  readonly hint: string;
}

export interface WorkflowRecentRunSummary {
  readonly runId: string;
  readonly status: WorkflowRun["status"];
  readonly updatedAt: string;
}

export type WorkflowStatusToolValue =
  | WorkflowStatusToolResult
  | { readonly runs: ReadonlyArray<WorkflowRecentRunSummary> };

export type T3TeamWorkflowStatusToolHandlers = {
  readonly getStatus: (args: {
    readonly runId?: string | undefined;
  }) => Effect.Effect<WorkflowStatusToolValue, string>;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One-sentence, per-status explanation of what the run is doing and what (if anything) to do
 * about it. Kept in one place so `runId` and list-mode summaries read consistently. */
const hintForStatus = (row: WorkflowRun): string => {
  switch (row.status) {
    case "failed":
      return row.failureReason
        ? `The run failed in ${row.failureStep ? userFacingFailureStep(row.failureStep) : "an unknown step"}: ${row.failureReason} — fix that cause, then resume (keeps the executed prefix) or launch again.`
        : "The run failed — the failure reason was posted to the launching thread; fix the source and launch again.";
    case "suspended":
      return row.pendingKind
        ? `Parked waiting on ${row.pendingKind}; it resumes automatically when that resolves.`
        : "Parked waiting on a reply; it resumes automatically.";
    case "sleeping":
      return row.wakeAt
        ? `Sleeping until ${row.wakeAt}; the scheduler wakes it automatically.`
        : "Sleeping on a timer; the scheduler wakes it automatically.";
    case "queued":
      return "Queued for engine capacity; it starts automatically once a slot frees up.";
    case "running":
      return "Actively running a step right now.";
    case "completed":
      return "Finished successfully; its output was posted to the launching thread.";
    case "cancelled":
      return "Cancelled before completion; no further progress will happen.";
    case "paused":
      return "Paused (e.g. a server restart mid-step); it resumes automatically once rehydrated.";
    default:
      return "Unrecognized status.";
  }
};

const toStatusResult = (row: WorkflowRun): WorkflowStatusToolResult => ({
  runId: row.runId,
  status: row.status,
  origin: row.origin,
  pendingKind: row.pendingKind ?? undefined,
  wakeAt: row.wakeAt ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  // Strictly additive: the keys are absent (not `undefined`-valued) for a run that never
  // failed, so an existing result shape is unchanged.
  ...(row.failureReason ? { failureReason: row.failureReason } : {}),
  ...(row.failureStep ? { failureStep: row.failureStep } : {}),
  hint: hintForStatus(row),
});

const notFoundHint = (runId: string) =>
  `No orchestration run found for runId '${runId}'. Omit runId to list the most recent runs, or ` +
  "double-check the runId returned by t3team.orchestration.run.";

/** Over-fetch factor for list mode: rows are filtered to the calling thread after the query. */
const RECENT_RUNS_SCAN_LIMIT = 50;

/** Build the per-thread `t3team.orchestration.status` handler factory. Both modes are scoped to the
 * CALLING thread via the run row's `launchThreadId` — a thread can observe only the runs it
 * launched, never other threads'/projects' run metadata. */
export function makeWorkflowStatusToolHandlers(deps: {
  readonly runRepository: WorkflowRunRepositoryShape;
}): (threadId: ThreadId) => T3TeamWorkflowStatusToolHandlers {
  const { runRepository } = deps;
  return (threadId) => ({
    getStatus: (args) => {
      const runId = args.runId?.trim() ?? "";
      if (runId.length > 0) {
        return runRepository.getById({ runId }).pipe(
          Effect.mapError(errorMessage),
          Effect.flatMap((row) =>
            // An unknown id and another thread's run answer identically, so run
            // ids can't be probed across threads.
            Option.isSome(row) && row.value.launchThreadId === String(threadId)
              ? Effect.succeed(toStatusResult(row.value))
              : Effect.fail(notFoundHint(runId)),
          ),
        );
      }
      return runRepository.listRecent({ limit: RECENT_RUNS_SCAN_LIMIT }).pipe(
        Effect.mapError(errorMessage),
        Effect.map(
          (rows) =>
            ({
              runs: rows
                .filter((row) => row.launchThreadId === String(threadId))
                .slice(0, RECENT_RUNS_LIMIT)
                .map((row) => ({
                  runId: row.runId,
                  status: row.status,
                  updatedAt: row.updatedAt,
                })),
            }) satisfies WorkflowStatusToolValue,
        ),
      );
    },
  });
}
