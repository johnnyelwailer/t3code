/**
 * Pause / resume / stop a durable workflow run — the ONE control sequence behind both the card's
 * buttons (`t3team-thread-workflow-control-route.ts`) and the agent's
 * `t3team.orchestration.pause` / `t3team.orchestration.stop` tools (the orchestrator had no way to
 * stop its own overnight run, GHE #403 §4). Same validation, registry / repo / scheduler
 * choreography, and run-level activity: the card and the tool can never disagree about what
 * "paused" or "stopped" means. Fails with a plain, agent-readable string; callers wrap it.
 */
import { CommandId, EventId, ThreadId, type OrchestrationCommand } from "@t3tools/contracts";
import { PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP } from "@t3tools/project-recipes";
import * as Effect from "effect/Effect";

import type { OrchestrationDispatchError } from "./orchestration/Errors.ts";
import type {
  WorkflowRun,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";
import { NON_TERMINAL_STATUSES, reportStaleWrite } from "./t3team-workflowRunControlCas.ts";
import {
  retryFailedWorkflowRun,
  type WorkflowRunControlRetryDeps,
} from "./t3team-workflowRunControlRetry.ts";
import { pausedResumeBlocker, restorePausedPendingAsk } from "./t3team-workflowResumePausedTurn.ts";

export type WorkflowRunControlAction = "pause" | "resume" | "stop";
export type WorkflowRunControlStatus =
  | "suspended"
  | "sleeping"
  | "paused"
  | "cancelled"
  | "running";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function workflowControlValidationError(
  run: { readonly launchThreadId: string | null; readonly status: string },
  input: { readonly threadId: string; readonly action: WorkflowRunControlAction },
): string | null {
  if (run.launchThreadId !== input.threadId) return "Workflow run not found for this thread.";
  if (
    input.action === "pause" &&
    run.status !== "suspended" &&
    run.status !== "sleeping" &&
    // Pause on an already-paused run is idempotent (GHE #411 §2): a retried tool call must
    // succeed, not error, so `paused` passes validation here and short-circuits below.
    run.status !== "paused"
  ) {
    return "Pause is available only while the workflow is waiting or scheduled.";
  }
  if (
    input.action === "resume" &&
    run.status !== "paused" &&
    run.status !== "failed" // GHE #344: retry re-drives a terminal-failed run from its journal.
  ) {
    return "This workflow is not paused or failed.";
  }
  if (input.action === "stop" && TERMINAL.has(run.status)) return "Workflow is already finished.";
  return null;
}

export interface WorkflowRunControlDeps {
  readonly repo: WorkflowRunRepositoryShape;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly rearmScheduler: () => Promise<void>;
  readonly dispatch: (
    command: OrchestrationCommand,
  ) => Effect.Effect<unknown, OrchestrationDispatchError>;
  readonly nowIso: () => string;
  /**
   * Who is stopping. The card's Stop is the user's own click, stamped like the composer's Stop button
   * (t3team-actorMessageReactor.ts); the agent's tool is automation and must not masquerade as the user.
   */
  readonly stopOrigin: "user" | "system";
  readonly turnRedrive?: InterruptedTurnRetry;
  /** GHE #344: failed-run retry deps; absent where no durable journal (agent pause/stop tools). */
  readonly retryFailed?: WorkflowRunControlRetryDeps;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Apply one control action to a run row. Validation failures and persistence errors surface as
 * one readable string; the returned status is the run's new durable status. */
export const controlWorkflowRun = Effect.fn("controlWorkflowRun")(function* (
  deps: WorkflowRunControlDeps,
  run: WorkflowRun,
  input: { readonly threadId: string; readonly action: WorkflowRunControlAction },
) {
  const validationError = workflowControlValidationError(run, input);
  if (validationError !== null) return yield* Effect.fail(validationError);
  const { repo, registry } = deps;
  const runId = run.runId;
  let status: WorkflowRunControlStatus;

  if (input.action === "pause") {
    // Idempotent retry (GHE #411 §2): pausing an already-paused run is a success — no write, no duplicate activity.
    if (run.status === "paused") return { status: "paused" as const };
    if (run.status === "suspended" && run.pendingThreadId !== null) {
      const pending = registry.peekPending(run.pendingThreadId);
      if (pending?.runId !== runId) {
        return yield* Effect.fail("Workflow is already running its next step.");
      }
    }
    // CAS (GHE #411 §1): lands only while the row is still where read — a run that settled in between is reported, not flipped.
    const affected = yield* repo
      .casSetStatus({
        runId,
        status: "paused",
        updatedAt: deps.nowIso(),
        expectedStatuses: ["suspended", "sleeping"],
      })
      .pipe(Effect.mapError(errorMessage));
    if (!affected) return yield* reportStaleWrite(repo, runId);
    workflowAdmissionQueue.pause(runId);
    // A pending re-drive fiber armed for this run's step must not survive the pause — see
    // `removePendingForRun` (GHE #411 §3), which interrupts it before dropping the pending ask.
    registry.removePendingForRun(runId);
    yield* Effect.promise(() => deps.rearmScheduler());
    status = "paused";
  } else if (input.action === "resume") {
    if (run.status === "failed") {
      // GHE #344: retry — journal re-drive, shared with the `t3team.orchestration.resume` tool.
      return yield* retryFailedWorkflowRun(deps, run, input.threadId);
    }
    if (run.pendingCorrelationId === null) {
      return yield* Effect.fail("This workflow is not paused.");
    }
    const blocker = pausedResumeBlocker(deps, run);
    if (blocker !== null) return yield* Effect.fail(blocker);
    yield* repo
      .resumePaused({ runId, updatedAt: deps.nowIso() })
      .pipe(Effect.mapError(errorMessage));
    workflowAdmissionQueue.resume(runId);
    if (run.pendingKind !== null && run.pendingThreadId !== null) {
      yield* restorePausedPendingAsk(deps, run);
      status = "suspended";
    } else if (run.wakeAt !== null) {
      yield* Effect.promise(() => deps.rearmScheduler());
      status = "sleeping";
    } else {
      return yield* Effect.fail("Paused workflow has no continuation.");
    }
  } else {
    // Synchronous first: an active detached controller can no longer publish completion, and the cancel
    // interrupts any re-drive fiber armed for the run's step (registry.cancelRun, GHE #411 §3).
    const childThreads = registry.childThreadsForRun(runId);
    registry.cancelRun(runId);
    workflowAdmissionQueue.cancel(runId);
    // Compare-and-set (GHE #411 §1): only a still-non-terminal row is flipped to `cancelled` — a run
    // that already completed/failed in between is reported, not overwritten.
    const affected = yield* repo
      .casClearPending({
        runId,
        status: "cancelled",
        updatedAt: deps.nowIso(),
        expectedStatuses: NON_TERMINAL_STATUSES,
      })
      .pipe(Effect.mapError(errorMessage));
    if (!affected) return yield* reportStaleWrite(repo, runId);
    for (const childThreadId of childThreads) {
      yield* deps
        .dispatch({
          type: "thread.turn.interrupt",
          commandId: CommandId.make(`t3team-wf-stop-child:${runId}:${childThreadId}`),
          threadId: ThreadId.make(childThreadId),
          t3teamStopOrigin: deps.stopOrigin,
          createdAt: deps.nowIso(),
        })
        .pipe(Effect.mapError(errorMessage));
    }
    yield* Effect.promise(() => deps.rearmScheduler());
    status = "cancelled";
  }

  // Run-level activity: what the card's banner reads ("Workflow paused" + when); the tool emits it exactly as the button.
  const phase = status === "cancelled" ? "cancelled" : status === "paused" ? "paused" : "started";
  yield* deps
    .dispatch({
      type: "thread.activity.append",
      commandId: CommandId.make(`t3team-wf-control:${runId}:${deps.nowIso()}`),
      threadId: ThreadId.make(input.threadId),
      activity: {
        id: EventId.make(`t3team-wf-step:${runId}:run`),
        tone: "info",
        kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
        summary:
          status === "paused"
            ? "Workflow paused"
            : status === "cancelled"
              ? "Workflow stopped"
              : "Workflow resumed",
        payload: {
          workflowRunId: runId,
          stepId: `run:${runId}`,
          stepKind: "run",
          phase,
          projectId: run.projectId,
        },
        turnId: null,
        createdAt: deps.nowIso(),
      },
      createdAt: deps.nowIso(),
    })
    .pipe(Effect.mapError(errorMessage));

  return { status };
});
