/**
 * Builds a run's broker + resume closure and registers it, WITHOUT starting it.
 *
 * Its own module because it has two callers with opposite starting points — `launchWorkflowRecipe`
 * (which then calls `startWorkflow`) and boot rehydration (which restores the pending ask
 * instead) — and the whole point is that a fresh and a restored run drive forward through
 * identical code. Depends only downward, never back on the launch module.
 */
// @effect-diagnostics globalConsole:off -- onComplete sink failure log in a plain Promise path, outside any Effect runtime.

import {
  type SuspendedResult,
  type WorkflowRef,
  type WorkflowRunOptions,
  type WorkflowRunResult,
} from "@t3team/sdk";

import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import { makeControllerFail, makeControllerResume } from "./t3team-workflowEngineResume.ts";
import { createWorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";
import { deliverWorkflowCompletion } from "./t3team-workflowCompletionMessage.ts";
import { settleWorkflowRunFailure } from "./t3team-workflowRunFailure.ts";
import type { WorkflowRepairIntent } from "./t3team-workflowSelfHeal.ts";
import { tryWorkflowRepair } from "./t3team-workflowEngineRepair.ts";
import { toWorkflowModelSelection } from "./t3team-workflowModelSelection.ts";
import { t3teamWorkflowHostToolRunOptions } from "./t3team-workflowHostDraftTools.ts";

// Moved to the types module (LOC cap); re-exported so existing importers stay valid.
export type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";
import type { WorkflowLaunchStatus } from "./t3team-workflowEngineLaunchTypes.ts";

import type {
  LaunchWorkflowRecipeInput,
  WorkflowRunController,
} from "./t3team-workflowEngineLaunchTypes.ts";

export function createWorkflowRunController(
  input: LaunchWorkflowRecipeInput,
): WorkflowRunController {
  let cancelled = false;
  const ref: WorkflowRef = {
    kind: "workflow",
    path: input.workflowPath,
    absolutePath: input.workflowPath,
  };
  // The live step-status emitter (UX slice 1). Terminal run activities are emitted HERE — in
  // settle (completed) and the launch/resume catch (failed) — not in the durability lifecycle:
  // this controller is the single funnel BOTH the live launch and boot rehydration drive
  // through, and it already holds `dispatch` + `launchThreadId`, so no seam threading through
  // makeWorkflowRunLifecycle is needed.
  const stepActivities = createWorkflowStepActivityEmitter({
    runId: input.runId,
    projectId: input.projectId,
    launchThreadId: input.launchThreadId,
    dispatch: input.dispatch,
    newId: input.newId,
    nowIso: input.nowIso,
  });
  const broker = createWorkflowEngineBroker({
    stepActivities,
    runId: input.runId,
    ...(input.launchThreadId === undefined ? {} : { launchThreadId: input.launchThreadId }),
    projectId: input.projectId,
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    registry: input.registry,
    dispatch: input.dispatch,
    newId: input.newId,
    nowIso: input.nowIso,
    ...(input.lifecycle === undefined
      ? {}
      : {
          beforePrimitive: () => input.lifecycle!.recordActive(),
          afterPrimitive: () => input.lifecycle!.releaseActive(),
          recordPending: (pending) => input.lifecycle!.recordSuspended(pending),
          recordSleeping: (sleep) => input.lifecycle!.recordSleeping(sleep),
        }),
  });
  const options: WorkflowRunOptions = {
    runsRoot: input.runsRoot,
    broker,
    ...t3teamWorkflowHostToolRunOptions(input.hostToolClient),
    scripts: input.scripts ?? {},
    defaultModel: toWorkflowModelSelection(
      input.defaultAgentModelSelection ?? input.modelSelection,
    ),
    ...(input.lifecycle === undefined
      ? {}
      : {
          beforePrimitive: () => input.lifecycle!.recordActive(),
          afterPrimitive: () => input.lifecycle!.releaseActive(),
        }),
    ...(input.store === undefined ? {} : { store: input.store }),
    ...(input.launchThreadId === undefined ? {} : { launchThreadId: input.launchThreadId }),
    // Preserve T3Team's pre-extraction behavior for every controller-driven resume (pending
    // replies, timers, and boot rehydration): use the current source on disk unless a host caller
    // explicitly requests strict checking. The reusable core remains strict by default.
    workflowVersionPolicy: input.workflowVersionPolicy ?? "allow-change",
  };

  const settle = async (
    result: WorkflowRunResult<unknown> | SuspendedResult,
  ): Promise<WorkflowLaunchStatus> => {
    if (cancelled) return "suspended";
    if ("suspended" in result) return "suspended"; // parked — the reactor resumes it later
    await input.lifecycle?.recordCompleted();
    if (cancelled) return "suspended";
    await stepActivities.emitRun("completed");
    await deliverWorkflowCompletion({
      launchThreadId: input.launchThreadId,
      workflowRunId: input.runId,
      output: result.result,
      projectId: input.projectId,
      dispatch: input.dispatch,
      newId: input.newId,
      nowIso: input.nowIso,
    });
    // The run itself completed — a throwing output sink must not flip it to
    // "failed" after the completion message already posted (double-notify).
    try {
      await input.onComplete?.(result.result);
    } catch (sinkError) {
      console.warn(`[t3team-workflow] onComplete sink failed for run ${input.runId}:`, sinkError);
    }
    input.registry.deleteRun(input.runId);
    return "completed";
  };

  // The concurrency/crash-safe resume closure (see t3team-workflowEngineResume.ts). Extracted to
  // keep this module under the prefixed-file LOC cap.
  const resume = makeControllerResume({
    input,
    ref,
    options,
    settle,
    stepActivities,
    isCancelled: () => cancelled,
  });

  input.registry.registerRun(input.runId, {
    resume,
    // Host-detected terminal failure — an ask that can never be answered (see
    // `WorkflowRegisteredRun.fail`), routed through the ONE failure funnel.
    fail: makeControllerFail({ input, stepActivities, isCancelled: () => cancelled }),
    cancel: () => {
      cancelled = true;
    },
  });
  input.registry.registerOwnership(input.runId, input.launchThreadId);
  return { ref, options, settle, resume, stepActivities, isCancelled: () => cancelled };
}
