/**
 * Pause / resume / stop a durable workflow run — the ONE control sequence behind both the card's
 * buttons (`t3team-thread-workflow-control-route.ts`) and the agent's
 * `t3team.orchestration.pause` / `t3team.orchestration.stop` tools (GHE #403 §4: the orchestrator
 * had no way to stop its own overnight run, so it launched a duplicate beside it). Same validation,
 * same registry / repo / scheduler choreography, same run-level activity — the card and the tool
 * can never disagree about what "paused" or "stopped" means.
 *
 * Fails with a plain, agent-readable string; callers wrap it for their transport.
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

export type WorkflowRunControlAction = "pause" | "resume" | "stop";
export type WorkflowRunControlStatus = "suspended" | "sleeping" | "paused" | "cancelled";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function workflowControlValidationError(
  run: { readonly launchThreadId: string | null; readonly status: string },
  input: { readonly threadId: string; readonly action: WorkflowRunControlAction },
): string | null {
  if (run.launchThreadId !== input.threadId) return "Workflow run not found for this thread.";
  if (input.action === "pause" && run.status !== "suspended" && run.status !== "sleeping") {
    return "Pause is available only while the workflow is waiting or scheduled.";
  }
  if (input.action === "resume" && run.status !== "paused") return "This workflow is not paused.";
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
   * Who is stopping. The card's Stop is the user's own click and is stamped like the composer's
   * Stop button (see t3team-actorMessageReactor.ts for what that suppresses); the agent's tool is
   * automation and must not masquerade as the user.
   */
  readonly stopOrigin: "user" | "system";
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
    if (run.status === "suspended" && run.pendingThreadId !== null) {
      const pending = registry.peekPending(run.pendingThreadId);
      if (pending?.runId !== runId) {
        return yield* Effect.fail("Workflow is already running its next step.");
      }
    }
    workflowAdmissionQueue.pause(runId);
    yield* repo
      .setStatus({ runId, status: "paused", updatedAt: deps.nowIso() })
      .pipe(Effect.mapError(errorMessage));
    registry.removePendingForRun(runId);
    yield* Effect.promise(() => deps.rearmScheduler());
    status = "paused";
  } else if (input.action === "resume") {
    if (run.pendingCorrelationId === null) {
      return yield* Effect.fail("This workflow is not paused.");
    }
    if (registry.getRun(runId) === undefined) {
      return yield* Effect.fail(
        "Workflow controller is not ready. Restart the server and try again.",
      );
    }
    yield* repo
      .resumePaused({ runId, updatedAt: deps.nowIso() })
      .pipe(Effect.mapError(errorMessage));
    workflowAdmissionQueue.resume(runId);
    if (run.pendingKind !== null && run.pendingThreadId !== null) {
      registry.setPending(run.pendingThreadId, {
        runId,
        correlationId: run.pendingCorrelationId,
        kind: run.pendingKind,
      });
      status = "suspended";
    } else if (run.wakeAt !== null) {
      yield* Effect.promise(() => deps.rearmScheduler());
      status = "sleeping";
    } else {
      return yield* Effect.fail("Paused workflow has no continuation.");
    }
  } else {
    // Synchronous first: an active detached controller can no longer publish completion.
    const childThreads = registry.childThreadsForRun(runId);
    registry.cancelRun(runId);
    workflowAdmissionQueue.cancel(runId);
    yield* repo
      .clearPending({ runId, status: "cancelled", updatedAt: deps.nowIso() })
      .pipe(Effect.mapError(errorMessage));
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

  // The run-level activity is what the card's banner reads ("Workflow paused" + when) — emitted
  // for the tool exactly as for the button, so an agent-side pause is as visible as a click.
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
