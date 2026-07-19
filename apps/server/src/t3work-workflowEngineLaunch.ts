/**
 * Launches a recipe's `.workflow.ts` through the durable engine (Epic 25 §Host wiring) — the
 * repointed replacement for the deleted step-union launch path.
 *
 * It builds the per-run orchestration broker, registers a `resume` closure (so the reactor can
 * drive the run forward when a turn completes or the user replies), then calls
 * `startWorkflow`. A run that fires an ask verb returns a `SuspendedResult` and is parked; the
 * registry keeps its `resume` alive until the reply lands. A completed run is unregistered.
 *
 * ── Durability (Epic 25 §Open question 2) ────────────────────────────────────
 * Two optional seams make a parked run survive a restart, and the {@link createWorkflowRunController}
 * that wires them is shared with boot rehydration so a restored run behaves identically:
 *   • `store` — a {@link JournalStore} (the host's SQLite store). Threaded into startWorkflow /
 *     resumeWorkflow / appendResolvedEntry so the journal is DB-backed, not on local disk.
 *   • `lifecycle` — a {@link WorkflowRunLifecycle} write-through to `workflow_runs`: `recordRunning`
 *     on launch, `recordSuspended` when an ask parks the run (driven by the broker, which knows
 *     the pending thread/correlation/kind), `recordCompleted`/`recordFailed` on settle. The
 *     in-memory registry stays the reactor's hot index; the DB is the source of truth a boot
 *     rehydration reads to rebuild this controller.
 * Both default to undefined — the SDK-style fs path (and the launch test) run unchanged.
 *
 * The Promise/Effect bridge: orchestration commands run via the injected `dispatch`, so the
 * Promise-based engine can drive the Effect-based host. `resume` re-enters `resumeWorkflow`,
 * which replays journaled asks (NOT re-firing the broker) and only fires past the frontier.
 */

import type {
  ModelSelection,
  OrchestrationCommand,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";

import {
  type JournalStore,
  startWorkflow,
  type SuspendedResult,
  type WorkflowRef,
  type WorkflowRunOptions,
  type WorkflowRunResult,
} from "@t3work/sdk";

import { createWorkflowEngineBroker } from "./t3work-workflowEngineBroker.ts";
import type { WorkflowRunLifecycle } from "./t3work-workflowEngineBrokerTypes.ts";
import type { T3workWorkflowEngineRegistryShape } from "./t3work-workflowEngineRegistry.ts";
import { makeControllerResume } from "./t3work-workflowEngineResume.ts";
import {
  createWorkflowStepActivityEmitter,
  type WorkflowStepActivityEmitter,
} from "./t3work-workflowEngineStepActivities.ts";
import { deliverWorkflowCompletion } from "./t3work-workflowCompletionMessage.ts";

export type WorkflowLaunchStatus = "completed" | "suspended" | "failed";

// Moved to the types module (LOC cap); re-exported so existing importers stay valid.
export type { WorkflowRunLifecycle } from "./t3work-workflowEngineBrokerTypes.ts";

export interface LaunchWorkflowRecipeInput {
  readonly runId: string;
  /** Absolute path to the recipe's `.workflow.ts` (resolved by discovery). */
  readonly workflowPath: string;
  readonly args: unknown;
  readonly runsRoot: string;
  /** The chat the user launched from; `undefined` for a headless run (`thread` is undefined). */
  readonly launchThreadId: string | undefined;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly registry: T3workWorkflowEngineRegistryShape;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
  /** DB-backed journal store; defaults to the fs store rooted at `runsRoot` when absent. */
  readonly store?: JournalStore;
  /** Write-through to the durable run record; no-op when absent. */
  readonly lifecycle?: WorkflowRunLifecycle;
  /** Optional sink for the validated workflow output when the run completes. */
  readonly onComplete?: (output: unknown) => Promise<void>;
  /** Optional sink for an uncaught run failure. */
  readonly onError?: (error: unknown) => Promise<void>;
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
}

/**
 * Build the per-run broker + resume closure and register the run, WITHOUT starting it. Shared
 * by {@link launchWorkflowRecipe} (which then calls `startWorkflow`) and boot rehydration
 * (which restores the pending ask instead) so a freshly launched and a restored run drive
 * forward through identical code.
 */
export function createWorkflowRunController(
  input: LaunchWorkflowRecipeInput,
): WorkflowRunController {
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
          recordPending: (pending) => input.lifecycle!.recordSuspended(pending),
          recordSleeping: (sleep) => input.lifecycle!.recordSleeping(sleep),
        }),
  });
  const options: WorkflowRunOptions = {
    runsRoot: input.runsRoot,
    broker,
    tools: [],
    scripts: {},
    ...(input.store === undefined ? {} : { store: input.store }),
    ...(input.launchThreadId === undefined ? {} : { launchThreadId: input.launchThreadId }),
  };

  const settle = async (
    result: WorkflowRunResult<unknown> | SuspendedResult,
  ): Promise<WorkflowLaunchStatus> => {
    if ("suspended" in result) return "suspended"; // parked — the reactor resumes it later
    input.registry.deleteRun(input.runId);
    await input.lifecycle?.recordCompleted();
    await stepActivities.emitRun("completed");
    await deliverWorkflowCompletion({
      launchThreadId: input.launchThreadId,
      workflowRunId: input.runId,
      output: result.result,
      dispatch: input.dispatch,
      newId: input.newId,
      nowIso: input.nowIso,
    });
    await input.onComplete?.(result.result);
    return "completed";
  };

  // The concurrency/crash-safe resume closure (see t3work-workflowEngineResume.ts). Extracted to
  // keep this module under the prefixed-file LOC cap.
  const resume = makeControllerResume({ input, ref, options, settle, stepActivities });

  input.registry.registerRun(input.runId, { resume });
  return { ref, options, settle, resume, stepActivities };
}

export async function launchWorkflowRecipe(
  input: LaunchWorkflowRecipeInput,
): Promise<LaunchWorkflowRecipeResult> {
  const controller = createWorkflowRunController(input);
  await input.lifecycle?.recordRunning();

  try {
    const status = await controller.settle(
      await startWorkflow(controller.ref, input.args, {
        ...controller.options,
        runId: input.runId,
      }),
    );
    return { runId: input.runId, status };
  } catch (error) {
    input.registry.deleteRun(input.runId);
    await input.lifecycle?.recordFailed();
    await controller.stepActivities.emitRun(
      "failed",
      error instanceof Error ? error.message : String(error),
    );
    await input.onError?.(error);
    return { runId: input.runId, status: "failed" };
  }
}
