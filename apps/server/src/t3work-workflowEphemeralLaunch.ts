/**
 * Shared launch-prep for durable workflow runs (ephemeral workflows, slice 1 — spec D10).
 *
 * Both launch surfaces call this ONE funnel so a recipe launch and an agent-authored ephemeral
 * launch drive through identical durability wiring:
 *   • the HTTP recipe-launch route (`t3work-thread-recipe-workflow-routes.ts`), which stamps the
 *     recipe-launch activity BEFORE calling in (composer-override disarm — recipe-only concern);
 *   • the `t3work.workflow.run` tool handler (`t3work-toolBrokerWorkflowRunTools.ts`), which
 *     skips the stamp (no composer override to disarm) and passes origin `ephemeral`.
 * It builds the SQLite-backed lifecycle row (with `origin`), emits the best-effort play-as-shape
 * preview into the launch thread (observability — an unreadable source skips it), then launches
 * through `launchWorkflowRecipe`.
 */
import type {
  ModelSelection,
  OrchestrationCommand,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import type { JournalStore, WorkflowRunIntent } from "@t3work/sdk";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type {
  WorkflowRunOrigin,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import { t3workRandomUUID } from "./t3work-random.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3work-workflowEngineDurability.ts";
import {
  launchWorkflowRecipe,
  type LaunchWorkflowRecipeResult,
} from "./t3work-workflowEngineLaunch.ts";
import type { T3workWorkflowEngineRegistryShape } from "./t3work-workflowEngineRegistry.ts";
import { buildWorkflowShapePreviewCommand } from "./t3work-workflowShapePreview.ts";
import {
  replaceEphemeralWorkflowSourceAtomically,
  writeEphemeralWorkflowRepairAudit,
} from "./t3work-workflowEphemeralSource.ts";
import { getWorkflowRepairPolicy } from "./t3work-workflowRepairPolicy.ts";

function nowIso(): string {
  return DateTime.formatIso(DateTime.nowUnsafe());
}

export interface PreparedWorkflowLaunchDeps {
  readonly registry: T3workWorkflowEngineRegistryShape;
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
}

export interface PreparedWorkflowLaunchInput {
  readonly runId: string;
  readonly workflowPath: string;
  readonly args: unknown;
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
}

/** Launch a prepared workflow through the durable engine; never fails (a run failure settles
 * as `status: "failed"` inside `launchWorkflowRecipe`). */
export const launchPreparedWorkflow = Effect.fn("launchPreparedWorkflow")(function* (
  deps: PreparedWorkflowLaunchDeps,
  input: PreparedWorkflowLaunchInput,
) {
  const repairPolicy = getWorkflowRepairPolicy();
  const pathService = deps.path;
  const ephemeralWorkflowPath =
    pathService === undefined
      ? undefined
      : pathService.join(input.workspaceRoot, ".t3work-runs", input.runId, "workflow.ts");
  const canReplaceEphemeralSource = input.workflowPath === ephemeralWorkflowPath;
  const lifecycle = makeWorkflowRunLifecycle({
    repo: deps.runRepository,
    row: buildRunningWorkflowRunRow({
      runId: input.runId,
      workflowPath: input.workflowPath,
      args: input.args,
      launchThreadId: input.launchThreadId,
      projectId: input.projectId,
      modelSelection: input.modelSelection,
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
      origin: input.origin,
      nowIso: nowIso(),
    }),
    nowIso,
    onSleep: () => {
      void deps.rearmScheduler();
    },
  });

  // Best-effort play-as-shape "plan" so the user sees WHAT THE WORKFLOW WILL DO while it spins
  // up. An unreadable source / underivable shape / headless launch skips the preview.
  if (deps.fileSystem !== undefined && input.launchThreadId !== undefined) {
    const launchThreadId = input.launchThreadId;
    const shapeSource = yield* deps.fileSystem
      .readFileString(input.workflowPath)
      .pipe(Effect.orElseSucceed(() => null));
    const shapeCommand =
      shapeSource === null
        ? null
        : buildWorkflowShapePreviewCommand({
            threadId: launchThreadId,
            workflowPath: input.workflowPath,
            sourceText: shapeSource,
            runId: input.runId,
            newId: () => t3workRandomUUID(),
            nowIso: nowIso(),
          });
    if (shapeCommand) {
      yield* Effect.promise(() => deps.dispatch(shapeCommand));
    }
  }

  const result: LaunchWorkflowRecipeResult = yield* Effect.promise(() =>
    launchWorkflowRecipe({
      runId: input.runId,
      workflowPath: input.workflowPath,
      args: input.args,
      runsRoot: `${input.workspaceRoot}/.t3work-runs`,
      launchThreadId: input.launchThreadId,
      projectId: input.projectId,
      modelSelection: input.modelSelection,
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
      registry: deps.registry,
      dispatch: deps.dispatch,
      newId: () => t3workRandomUUID(),
      nowIso,
      store: deps.journalStore,
      lifecycle,
      ...(input.onComplete === undefined ? {} : { onComplete: input.onComplete }),
      ...(input.onError === undefined ? {} : { onError: input.onError }),
      ...(input.intent === undefined || !canReplaceEphemeralSource
        ? {}
        : { repairIntent: input.intent }),
      repairMaxAttempts:
        input.repairMaxAttempts ?? deps.repairMaxAttempts ?? repairPolicy.maxAttempts,
      repairModelSelection: deps.repairModelSelection ?? repairPolicy.modelSelection,
      repairTotalTimeBudgetMs: deps.repairTotalTimeBudgetMs ?? repairPolicy.totalTimeBudgetMs,
      ...(deps.fileSystem === undefined || pathService === undefined
        ? {}
        : {
            readWorkflowSource: () =>
              Effect.runPromise(deps.fileSystem!.readFileString(input.workflowPath)),
            replaceWorkflowSource: (source: string) =>
              Effect.runPromise(
                replaceEphemeralWorkflowSourceAtomically({
                  runsRoot: `${input.workspaceRoot}/.t3work-runs`,
                  runId: input.runId,
                  source,
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, deps.fileSystem!),
                  Effect.provideService(Path.Path, pathService!),
                ),
              ).then(() => undefined),
            recordRepairAudit: (audit) =>
              Effect.runPromise(
                writeEphemeralWorkflowRepairAudit({
                  runsRoot: `${input.workspaceRoot}/.t3work-runs`,
                  runId: input.runId,
                  timestamp: nowIso(),
                  ...audit,
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, deps.fileSystem!),
                  Effect.provideService(Path.Path, pathService!),
                ),
              ).then(() => undefined),
          }),
    }),
  );
  return result;
});
