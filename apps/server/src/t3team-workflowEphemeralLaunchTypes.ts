/**
 * What a prepared ephemeral workflow launch is given: the host services it runs against, and
 * the run's own description.
 *
 * Types only, on the same pattern as `t3team-workflowEngineLaunchTypes.ts`, and importing
 * nothing from the launch module so it cannot take part in an import cycle.
 */
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type {
  ModelSelection,
  OrchestrationCommand,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import type { AnyScriptRef, JournalStore, WorkflowRunIntent } from "@t3team/sdk";

import type {
  WorkflowRun,
  WorkflowRunOrigin,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import type { LaunchWorkflowRecipeInput } from "./t3team-workflowEngineLaunchTypes.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";

export interface PreparedWorkflowLaunchDeps {
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly runRepository: WorkflowRunRepositoryShape;
  readonly journalStore: JournalStore;
  /** Scheduler poke re-arming the soonest-deadline timer after a `waitUntil` park (Epic 27). */
  readonly rearmScheduler: () => Promise<void>;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  /** Backs the best-effort shape preview; absent = preview skipped, launch unchanged. */
  readonly fileSystem?: FileSystem.FileSystem | undefined;
  /** Needed only to verify and atomically replace an ephemeral workflow source. */
  readonly path?: Path.Path | undefined;
  /** Distribution policy. Omitted uses Nexi's default of three bounded attempts. */
  readonly repairMaxAttempts?: number;
  readonly repairModelSelection?: "inherit" | ModelSelection;
  readonly repairTotalTimeBudgetMs?: number;
  readonly generateRepairStructured?: LaunchWorkflowRecipeInput["generateRepairStructured"];
}

export interface PreparedWorkflowLaunchInput {
  readonly runId: string;
  readonly workflowPath: string;
  readonly args: unknown;
  /** The launching recipe's private scripts (recipe launches only; Epic 25 §Scripts). */
  readonly scripts?: Readonly<Record<string, AnyScriptRef>>;
  /** Per-run bridge to the broker's work-item draft tools (t3team-workflowHostDraftTools.ts). */
  readonly hostToolClient?: LaunchWorkflowRecipeInput["hostToolClient"];
  /** The same grant in persistable form; recorded on the run row so boot rehydration restores
   * this bridge and its scope rather than inferring one (migration 047). */
  readonly hostToolGrant?: WorkflowRun["hostToolGrant"];
  /** The launching recipe's directory — persisted on the run row so boot rehydration can
   * re-resolve `scripts` after a restart (see t3team-workflowRehydrateScripts.ts). */
  readonly recipePath?: string | undefined;
  /** Agent-supplied contract; present for ephemeral workflow-tool launches. */
  readonly intent?: WorkflowRunIntent;
  /** Bounded host repair attempts; zero disables repair. */
  readonly repairMaxAttempts?: number;
  readonly workspaceRoot: string;
  readonly launchThreadId: string | undefined;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly origin: WorkflowRunOrigin;
  readonly onComplete?: (output: unknown) => Promise<void>;
  readonly onError?: (error: unknown) => Promise<void>;
  /** Resolves only after the run row and its visible shape card have been committed. */
  readonly onAdmitted?: () => Promise<void>;
}
