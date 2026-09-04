/**
 * The launch funnel's contract: what a durable workflow launch is given, what it returns, and
 * the per-run controller handed back to the registry.
 *
 * Its own module on the same pattern as `t3team-workflowEngineBrokerTypes.ts` (which is already
 * near the ceiling itself). Types only, importing nothing from the launch module, so it cannot
 * take part in an import cycle.
 */
import type {
  ModelSelection,
  OrchestrationCommand,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import type {
  AbortedResult,
  AnyScriptRef,
  JournalStore,
  SuspendedResult,
  T3TeamToolHandlerClient,
  WorkflowRef,
  WorkflowRunOptions,
  WorkflowRunResult,
  WorkflowVersionPolicy,
} from "@t3team/sdk";

import type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { WorkflowRepairIntent } from "./t3team-workflowSelfHeal.ts";
import type { WorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";

export type WorkflowLaunchStatus = "completed" | "suspended" | "failed";

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
  /** Host-owned abort: a pre-aborted or mid-run signal settles the run as aborted (never
   * completed). Distinct from the registry `cancel` (which parks the run for resume). */
  readonly abortSignal?: AbortSignal | undefined;
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
  /** Explicit source replacement policy used by a corrected-source resume. */
  readonly workflowVersionPolicy?: WorkflowVersionPolicy;
}

export interface LaunchWorkflowRecipeResult {
  readonly runId: string;
  readonly status: WorkflowLaunchStatus;
}

/** A registered run's driving handles: its workflow ref, run options, and resume/settle. */
export interface WorkflowRunController {
  readonly ref: WorkflowRef;
  readonly options: WorkflowRunOptions;
  /** Launch through the shared host funnel (running row → start → settle → repair). */
  readonly start: () => Promise<WorkflowLaunchStatus>;
  readonly settle: (
    result: WorkflowRunResult<unknown> | SuspendedResult | AbortedResult,
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
