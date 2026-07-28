/** Durable workflow launch and the per-run resume controller. */
// @effect-diagnostics globalConsole:off -- onComplete sink failure log in a plain Promise path, outside any Effect runtime.

import type {
  ModelSelection,
  OrchestrationCommand,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";

import {
  type AnyScriptRef,
  type JournalStore,
  startWorkflow,
  type SuspendedResult,
  type T3TeamToolHandlerClient,
  type WorkflowRef,
  type WorkflowRunOptions,
  type WorkflowRunResult,
} from "@t3team/sdk";

import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import { makeControllerFail, makeControllerResume } from "./t3team-workflowEngineResume.ts";
import {
  createWorkflowStepActivityEmitter,
  type WorkflowStepActivityEmitter,
} from "./t3team-workflowEngineStepActivities.ts";
import { deliverWorkflowCompletion } from "./t3team-workflowCompletionMessage.ts";
import { settleWorkflowRunFailure } from "./t3team-workflowRunFailure.ts";
import type { WorkflowRepairIntent } from "./t3team-workflowSelfHeal.ts";
import { tryWorkflowRepair } from "./t3team-workflowEngineRepair.ts";
import { toWorkflowModelSelection } from "./t3team-workflowModelSelection.ts";
import { t3teamWorkflowHostToolRunOptions } from "./t3team-workflowHostDraftTools.ts";

export type WorkflowLaunchStatus = "completed" | "suspended" | "failed";

// Moved to the types module (LOC cap); re-exported so existing importers stay valid.
export type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";

export interface LaunchWorkflowRecipeInput {
  readonly runId: string;
  /** Absolute path to the recipe's `.workflow.ts` (resolved by discovery). */
  readonly workflowPath: string;
  readonly args: unknown;
  /** The launching recipe's private scripts; bodies see them as `scripts.*` (Epic 25 §Scripts). */
  readonly scripts?: Readonly<Record<string, AnyScriptRef>>;
  /** Per-run bridge to the broker's work-item draft tools, built by the caller from the launch
   * thread (t3team-workflowHostDraftTools.ts). Absent leaves those refs bound but uncallable. */
  readonly hostToolClient?: T3TeamToolHandlerClient;
  readonly runsRoot: string;
  /** The chat the user launched from; `undefined` for a headless run (`thread` is undefined). */
  readonly launchThreadId: string | undefined;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  /** Default for workflow agent steps; absent inherits the launch thread model. */
  readonly defaultAgentModelSelection?: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
  /** DB-backed journal store; defaults to the fs store rooted at `runsRoot` when absent. */
  readonly store?: JournalStore;
  /** Write-through to the durable run record; no-op when absent. */
  readonly lifecycle?: WorkflowRunLifecycle;
  /** Admission already durably wrote the running row before detached execution. */
  readonly lifecycleAlreadyRunning?: boolean;
  /** Optional sink for the validated workflow output when the run completes. */
  readonly onComplete?: (output: unknown) => Promise<void>;
  /** Optional sink for an uncaught run failure. */
  readonly onError?: (error: unknown) => Promise<void>;
  /** Present only for agent-authored ephemeral source runs. */
  readonly repairIntent?: WorkflowRepairIntent;
  /** Resolved distribution policy; clamped by the core repair funnel. */
  readonly repairMaxAttempts?: number;
  /** Inherit the calling model unless the distribution supplies a repair model. */
  readonly repairModelSelection?: "inherit" | ModelSelection;
  /** Shared repair budget across all hidden child attempts. */
  readonly repairTotalTimeBudgetMs?: number;
  /** Host-owned structured generation. Unlike a repair thread, this surface exposes no tools. */
  readonly generateRepairStructured?: (input: {
    readonly prompt: string;
    readonly modelSelection: ModelSelection;
  }) => Promise<unknown>;
  /** Legacy low-level-test seam. Production ephemeral launch disables tool-capable repair turns. */
  readonly allowRepairThreadFallback?: boolean;
  readonly readWorkflowSource?: () => Promise<string>;
  readonly replaceWorkflowSource?: (source: string) => Promise<void>;
  readonly recordRepairAudit?: (audit: {
    readonly attempt: number;
    readonly originalError: string;
    readonly outcome: "recovered" | "failed";
    readonly summary?: string;
    readonly reason?: string;
  }) => Promise<void>;
}

export interface LaunchWorkflowRecipeResult {
  readonly runId: string;
  readonly status: WorkflowLaunchStatus;
}

/** A registered run's driving handles: its workflow ref, run options, and resume/settle. */
export interface WorkflowRunController {
  readonly ref: WorkflowRef;
  readonly options: WorkflowRunOptions;
  readonly settle: (
    result: WorkflowRunResult<unknown> | SuspendedResult,
  ) => Promise<WorkflowLaunchStatus>;
  readonly resume: (correlationId: string, reply: unknown) => Promise<void>;
  /** Live step-status sink shared by broker, settle, and resume (UX slice 1). */
  readonly stepActivities: WorkflowStepActivityEmitter;
  readonly isCancelled: () => boolean;
}

export {
  awaitWorkflowRepairChildReply,
  remainingWorkflowRepairBudget,
} from "./t3team-workflowEngineRepair.ts";

/**
 * Build the per-run broker + resume closure and register the run, WITHOUT starting it. Shared
 * by {@link launchWorkflowRecipe} (which then calls `startWorkflow`) and boot rehydration
 * (which restores the pending ask instead) so a freshly launched and a restored run drive
 * forward through identical code.
 */
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

export async function launchWorkflowRecipe(
  input: LaunchWorkflowRecipeInput,
): Promise<LaunchWorkflowRecipeResult> {
  const controller = createWorkflowRunController(input);
  if (!input.lifecycleAlreadyRunning) await input.lifecycle?.recordRunning();

  try {
    const status = await controller.settle(
      await startWorkflow(controller.ref, input.args, {
        ...controller.options,
        runId: input.runId,
      }),
    );
    return { runId: input.runId, status };
  } catch (error) {
    if (controller.isCancelled()) return { runId: input.runId, status: "suspended" };
    const repaired = await tryWorkflowRepair(input, controller, error);
    if (repaired) return { runId: input.runId, status: "completed" };
    // Stop may arrive while the hidden repair child is active. Do not overwrite the durable
    // stopped state with a later failure or leave callers waiting for the repair deadline.
    if (controller.isCancelled()) return { runId: input.runId, status: "suspended" };
    // The run may have completed DURING repair (settle deletes it from the registry and posts
    // the completion) with only post-completion bookkeeping failing afterwards — a late error
    // must not overwrite the genuine completion notice with a failure.
    if (input.registry.getRun(input.runId) === undefined)
      return { runId: input.runId, status: "completed" };
    await settleWorkflowRunFailure({
      runId: input.runId,
      launchThreadId: input.launchThreadId,
      error,
      registry: input.registry,
      lifecycle: input.lifecycle,
      stepActivities: controller.stepActivities,
      dispatch: input.dispatch,
      newId: input.newId,
      nowIso: input.nowIso,
      onError: input.onError,
      // Only an ephemeral, agent-authored run carries a repair intent, and only its reader owns the
      // source. A bundled or project recipe run was started by a human who cannot edit it.
      hostOwnsSource: input.repairIntent !== undefined,
    });
    return { runId: input.runId, status: "failed" };
  }
}
