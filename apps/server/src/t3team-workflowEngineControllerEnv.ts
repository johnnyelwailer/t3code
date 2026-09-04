/**
 * The t3team-side environment of a per-run workflow controller: the
 * dispatch-based broker, the live step-activity emitter, the authored-phase
 * cell, the composition-branch failure log, and the assembled
 * `WorkflowRunOptions`.
 *
 * Its own module next to `t3team-workflowEngineController.ts` (the host
 * funnel + t3team sinks) because the two have different sizes and different
 * churn: the env is the long-lived broker/options plumbing, the controller
 * is the shared-funnel binding. Depends only downward.
 */

import type { WorkflowRef, WorkflowRunOptions } from "@t3team/sdk";

import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import {
  createCompositionBranchFailureHandler,
  type WorkflowCompositionBranchFailure,
} from "./t3team-workflowEngineCompositionFailure.ts";
import { createWorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";
import { toWorkflowModelSelection } from "./t3team-workflowModelSelection.ts";
import { t3teamWorkflowHostToolRunOptions } from "./t3team-workflowHostDraftTools.ts";

import type { WorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";
import type { LaunchWorkflowRecipeInput } from "./t3team-workflowEngineLaunchTypes.ts";

export interface WorkflowRunControllerEnv {
  readonly ref: WorkflowRef;
  readonly options: WorkflowRunOptions;
  readonly stepActivities: WorkflowStepActivityEmitter;
  /** Parallel/pipeline branches that rejected during this run — the run's own
   * terminal activity annotates with a summary of these (a swallowed branch
   * rejection must never read as unqualified success). */
  readonly compositionBranchFailures: readonly WorkflowCompositionBranchFailure[];
}

export function createWorkflowRunControllerEnv(
  input: LaunchWorkflowRecipeInput,
): WorkflowRunControllerEnv {
  const ref: WorkflowRef = {
    kind: "workflow",
    path: input.workflowPath,
    absolutePath: input.workflowPath,
  };
  // The authored `phase()` group the body is currently inside — updated live by `onPhase` below,
  // read live by the broker's `step()`. Reconstructed correctly on every resume because the SDK
  // replays the WHOLE body from the top each time (fast-forwarding through already-recorded
  // primitives), so every `phase()` call before the live continuation point re-fires in the same
  // order before any NEW step activity can be emitted — see `WorkflowEngineBrokerDeps.currentPhase`.
  let currentWorkflowPhase: string | undefined;
  // Parallel/pipeline branches that rejected during this run (UX slice: a swallowed rejection
  // must never look like an unqualified success) — see `options.onCompositionBranchFailed` below
  // and the controller's use of this list to annotate the run's terminal activity.
  const compositionBranchFailures: WorkflowCompositionBranchFailure[] = [];
  // The live step-status emitter (UX slice 1). Terminal run activities are emitted in the
  // controller's host sinks (completed/failed), not in the durability lifecycle: the
  // controller is the single funnel BOTH the live launch and boot rehydration drive through,
  // and it already holds `dispatch` + `launchThreadId`.
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
    currentPhase: () => currentWorkflowPhase,
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
    // Feeds the SAME cell `currentPhase` (above) reads — see its comment for why a plain
    // in-memory cell is replay-safe here despite the SDK re-running the whole body on resume.
    onPhase: (title) => {
      currentWorkflowPhase = title;
    },
    // Live step-status pip for a swallowed `parallel()`/`pipeline()` rejection (see the
    // defect this closes: a failed branch previously left NO activity anywhere) — see
    // `t3team-workflowEngineCompositionFailure.ts`.
    onCompositionBranchFailed: createCompositionBranchFailureHandler({
      stepActivities,
      runId: input.runId,
      newId: input.newId,
      getWorkflowPhase: () => currentWorkflowPhase,
      onFailure: (failure) => compositionBranchFailures.push(failure),
    }),
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
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
    // Preserve T3Team's pre-extraction behavior for every controller-driven resume (pending
    // replies, timers, and boot rehydration): use the current source on disk unless a host caller
    // explicitly requests strict checking. The reusable core remains strict by default.
    workflowVersionPolicy: input.workflowVersionPolicy ?? "allow-change",
  };

  return { ref, options, stepActivities, compositionBranchFailures };
}
