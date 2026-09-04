/**
 * Builds a run's broker + host and registers it, WITHOUT starting it.
 *
 * Its own module because it has two callers with opposite starting points —
 * `launchWorkflowRecipe` (which then calls `start`) and boot rehydration
 * (which restores the pending ask instead) — and the whole point is that a
 * fresh and a restored run drive forward through identical code. The
 * start/settle/resume/fail funnel itself is the shared, host-neutral
 * `createWorkflowRunHost` from `@t3team/sdk`; this module owns only the
 * t3team-specific pieces: the dispatch-based broker, the step-activity UX
 * sinks, the agent self-repair funnel, and the terminal-failure sequence.
 *
 * Depends only downward, never back on the launch module.
 */
// @effect-diagnostics globalConsole:off -- onComplete sink failure log in a plain Promise path, outside any Effect runtime.

import {
  createWorkflowRunHost,
  type WorkflowRef,
  type WorkflowRunOptions,
} from "@t3team/sdk";

import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import {
  createCompositionBranchFailureHandler,
  summarizeCompositionBranchFailures,
  type WorkflowCompositionBranchFailure,
} from "./t3team-workflowEngineCompositionFailure.ts";
import { createWorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";
import { deliverWorkflowCompletion } from "./t3team-workflowCompletionMessage.ts";
import { toWorkflowModelSelection } from "./t3team-workflowModelSelection.ts";
import { t3teamWorkflowHostToolRunOptions } from "./t3team-workflowHostDraftTools.ts";
import { settleWorkflowRunFailure } from "./t3team-workflowRunFailure.ts";
import { tryWorkflowRepair } from "./t3team-workflowEngineRepair.ts";

// Moved to the types module (LOC cap); re-exported so existing importers stay valid.
export type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";

import type {
  LaunchWorkflowRecipeInput,
  WorkflowRunController,
} from "./t3team-workflowEngineLaunchTypes.ts";

export function createWorkflowRunController(
  input: LaunchWorkflowRecipeInput,
): WorkflowRunController {
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
  // and `settle`'s use of this count to annotate the run's own terminal activity.
  const compositionBranchFailures: WorkflowCompositionBranchFailure[] = [];
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

  // The per-run funnel itself — start/settle/resume/fail/cancel — is the shared, host-neutral
  // SDK host. This controller supplies its t3team sinks and the optional agent self-repair.
  const host = createWorkflowRunHost({
    ref,
    args: input.args,
    runId: input.runId,
    runOptions: options,
    registry: input.registry,
    ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
    sinks: {
      onCompleted: async (result) => {
        // The run itself completed — `parallel`/`pipeline` never rethrow a branch's rejection —
        // but a failed branch must keep this from reading as unqualifiedly green. `phase` stays
        // "completed" (that is the truth); `error` carries a summary a viewer sees the same way
        // as any other run-level note (the branch's own "failed" step row is the primary signal).
        await stepActivities.emitRun(
          "completed",
          summarizeCompositionBranchFailures(compositionBranchFailures),
        );
        await deliverWorkflowCompletion({
          launchThreadId: input.launchThreadId,
          workflowRunId: input.runId,
          output: result.result,
          projectId: input.projectId,
          dispatch: input.dispatch,
          newId: input.newId,
          nowIso: input.nowIso,
        });
        // A throwing output sink must not flip the run to "failed" after the completion
        // message already posted (double-notify).
        try {
          await input.onComplete?.(result.result);
        } catch (sinkError) {
          console.warn(`[t3team-workflow] onComplete sink failed for run ${input.runId}:`, sinkError);
        }
      },
      onFailed: async ({ phase, error }) => {
        await settleWorkflowRunFailure({
          runId: input.runId,
          launchThreadId: input.launchThreadId,
          error,
          registry: input.registry,
          lifecycle: input.lifecycle,
          stepActivities,
          dispatch: input.dispatch,
          newId: input.newId,
          nowIso: input.nowIso,
          onError: input.onError,
          phase: phase === "host" ? "resume" : phase,
          // Host-side fail (a step that can never be answered): the row KEEPS its pending ask so
          // `t3team.orchestration.resume` re-drives exactly that step rather than replaying into a
          // `sent` entry nobody settles (GHE #403).
          ...(phase === "host" ? { retainPendingStep: true } : {}),
        });
      },
      onAborted: async ({ reason }) => {
        await stepActivities.emitRun("failed", reason);
      },
    },
    // The awaited primitive resolved — flip its live step activity to `completed` (same id →
    // in-place upsert) before the replay drives to the next suspension.
    onReplyJournaled: async (correlationId) => {
      await stepActivities.emitResolved(correlationId, "completed");
    },
    repair: () => (error) =>
      tryWorkflowRepair(
        input,
        { ref, options, settle: host.settle, stepActivities, isCancelled: host.isCancelled },
        error,
      ),
    lifecycleAlreadyRunning: input.lifecycleAlreadyRunning,
  });

  return {
    ref,
    options,
    start: host.start,
    settle: host.settle,
    resume: host.resume,
    stepActivities,
    isCancelled: host.isCancelled,
  };
}
