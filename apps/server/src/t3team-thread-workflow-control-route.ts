import { CommandId, EventId, ThreadId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  type ControlProjectRecipeWorkflowRequest,
} from "@t3tools/project-recipes";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { HttpRouter } from "effect/unstable/http";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { nowIso } from "./t3team-thread-recipe-workflow-routes-resolve.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function workflowControlValidationError(
  run: { readonly launchThreadId: string | null; readonly status: string },
  input: { readonly threadId: string; readonly action: "pause" | "resume" | "stop" },
): string | null {
  if (run.launchThreadId !== input.threadId) return "Workflow run not found for this thread.";
  if (input.action === "pause" && run.status !== "suspended" && run.status !== "sleeping") {
    return "Pause is available only while the workflow is waiting or scheduled.";
  }
  if (input.action === "resume" && run.status !== "paused") return "This workflow is not paused.";
  if (input.action === "stop" && TERMINAL.has(run.status)) return "Workflow is already finished.";
  return null;
}

export const t3teamThreadWorkflowControlRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/workflow/control",
  Effect.gen(function* () {
    const input = yield* readJsonBody<ControlProjectRecipeWorkflowRequest>();
    const threadId = input.threadId?.trim() ?? "";
    const runId = input.workflowRunId?.trim() ?? "";
    if (!threadId || !runId || !["pause", "resume", "stop"].includes(input.action)) {
      return yield* new T3TeamAtlassianError({
        message: "threadId, workflowRunId and action are required.",
      });
    }

    const repo = yield* WorkflowRunRepository;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const scheduler = yield* T3TeamWorkflowScheduler;
    const orchestration = yield* OrchestrationEngineService;
    const found = yield* repo.getById({ runId });
    if (Option.isNone(found)) {
      return yield* new T3TeamAtlassianError({
        message: "Workflow run not found for this thread.",
      });
    }
    const run = found.value;
    const validationError = workflowControlValidationError(run, { threadId, action: input.action });
    if (validationError !== null) {
      return yield* new T3TeamAtlassianError({ message: validationError });
    }
    let status: "suspended" | "sleeping" | "paused" | "cancelled";

    if (input.action === "pause") {
      if (run.status === "suspended" && run.pendingThreadId !== null) {
        const pending = registry.peekPending(run.pendingThreadId);
        if (pending?.runId !== runId) {
          return yield* new T3TeamAtlassianError({
            message: "Workflow is already running its next step.",
          });
        }
      }
      workflowAdmissionQueue.pause(runId);
      yield* repo.setStatus({ runId, status: "paused", updatedAt: nowIso() });
      registry.removePendingForRun(runId);
      yield* Effect.promise(() => scheduler.rearm());
      status = "paused";
    } else if (input.action === "resume") {
      if (run.pendingCorrelationId === null) {
        return yield* new T3TeamAtlassianError({ message: "This workflow is not paused." });
      }
      if (registry.getRun(runId) === undefined) {
        return yield* new T3TeamAtlassianError({
          message: "Workflow controller is not ready. Restart the server and try again.",
        });
      }
      yield* repo.resumePaused({ runId, updatedAt: nowIso() });
      workflowAdmissionQueue.resume(runId);
      if (run.pendingKind !== null && run.pendingThreadId !== null) {
        registry.setPending(run.pendingThreadId, {
          runId,
          correlationId: run.pendingCorrelationId,
          kind: run.pendingKind,
        });
        status = "suspended";
      } else if (run.wakeAt !== null) {
        yield* Effect.promise(() => scheduler.rearm());
        status = "sleeping";
      } else {
        return yield* new T3TeamAtlassianError({ message: "Paused workflow has no continuation." });
      }
    } else {
      // Synchronous first: an active detached controller can no longer publish completion.
      const childThreads = registry.childThreadsForRun(runId);
      registry.cancelRun(runId);
      workflowAdmissionQueue.cancel(runId);
      yield* repo.clearPending({ runId, status: "cancelled", updatedAt: nowIso() });
      for (const childThreadId of childThreads) {
        yield* orchestration.dispatch({
          type: "thread.turn.interrupt",
          commandId: CommandId.make(`t3team-wf-stop-child:${runId}:${childThreadId}`),
          threadId: ThreadId.make(childThreadId),
          createdAt: nowIso(),
        });
      }
      yield* Effect.promise(() => scheduler.rearm());
      status = "cancelled";
    }

    const phase = status === "cancelled" ? "cancelled" : status === "paused" ? "paused" : "started";
    yield* orchestration.dispatch({
      type: "thread.activity.append",
      commandId: CommandId.make(`t3team-wf-control:${runId}:${nowIso()}`),
      threadId: ThreadId.make(threadId),
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
        createdAt: nowIso(),
      },
      createdAt: nowIso(),
    });

    return okJson({ ok: true, status });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to control workflow.")),
    Effect.catch(errorResponse),
  ),
);
