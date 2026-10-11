/**
 * `t3_orchestration_run { recipe, action? }` (G11): run a recipe action by id on the calling
 * thread, resolved through the recipe list's pack → project precedence, with the recipe's own
 * scripts, host-tool scope and script host — the same bindings `launchRecipeWorkflow` gives a
 * launch from the UI — and origin `recipe`. The caller keeps the one-run-per-thread rule and its
 * thread's modes; this module only resolves and launches.
 */
import type {
  ModelSelection,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import type { WorkflowRunIntent } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as FileSystemService from "effect/FileSystem";
import * as PathService from "effect/Path";

import type { recordRecipeLaunchFact } from "./t3team-recipeLaunchFact.ts";
import { resolveRecipeActionById } from "./t3team-recipeRunById.ts";
import { resolveRecipeRunBindings } from "./t3team-recipeRunBindings.ts";
import type { T3TeamScriptHost } from "./t3team-scriptHostContext.ts";
import type { T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import type { PreparedWorkflowLaunchDeps } from "./t3team-workflowEphemeralLaunch.ts";
import { launchDetachedWorkflow } from "./t3team-workflowRunDirectLaunch.ts";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface RecipeRunByIdDeps {
  /** The broker the run's host tools call back into; read at launch, after the broker exists. */
  readonly toolBroker: () => Pick<T3TeamToolBrokerShape, "bindSession">;
  readonly scriptHosts: T3TeamScriptHost["Service"];
  readonly recordLaunchFact: (
    input: Parameters<typeof recordRecipeLaunchFact>[0],
  ) => Effect.Effect<void, string>;
}

/**
 * The recipe action an id names, with the bindings its run gets, or why it cannot run. Read
 * before anything durable, so a refusal never follows a `replaceRunId` stop.
 */
export const prepareRecipeRun = Effect.fn("prepareRecipeRun")(
  function* (
    deps: RecipeRunByIdDeps | undefined,
    input: {
      readonly fileSystem: FileSystemService.FileSystem;
      readonly path: PathService.Path;
      readonly workspaceRoot: string;
      readonly recipe: string;
      readonly action: string | undefined;
      readonly runId: string;
      readonly threadId: ThreadId;
      readonly projectId: ProjectId;
    },
  ) {
    if (deps === undefined) {
      return yield* Effect.fail("Running a recipe by id is not enabled in this runtime.");
    }
    const resolved = yield* resolveRecipeActionById({
      workspaceRoot: input.workspaceRoot,
      recipeId: input.recipe,
      action: input.action,
    });
    const bindings = yield* resolveRecipeRunBindings({
      runId: input.runId,
      threadId: input.threadId,
      projectId: input.projectId,
      recipePath: resolved.recipePath,
      workflowPath: resolved.workflowPath,
      toolBroker: deps.toolBroker(),
      scriptHosts: deps.scriptHosts,
    });
    return { deps, resolved, bindings };
  },
  (effect, _deps, input) =>
    effect.pipe(
      Effect.provideService(FileSystemService.FileSystem, input.fileSystem),
      Effect.provideService(PathService.Path, input.path),
      Effect.mapError(errorMessage),
    ),
);

export type PreparedRecipeRun = Effect.Success<ReturnType<typeof prepareRecipeRun>>;

export const launchRecipeRun = Effect.fn("launchRecipeRun")(function* (
  prepared: PreparedRecipeRun,
  launch: PreparedWorkflowLaunchDeps,
  input: {
    readonly runId: string;
    readonly threadId: ThreadId;
    readonly projectId: ProjectId;
    readonly workspaceRoot: string;
    readonly modelSelection: ModelSelection;
    readonly runtimeMode: RuntimeMode;
    readonly interactionMode: ProviderInteractionMode;
    readonly args: unknown;
    readonly intent: WorkflowRunIntent;
  },
) {
  const { resolved } = prepared;
  const result = yield* launchDetachedWorkflow(launch, {
    runId: input.runId,
    workflowPath: resolved.workflowPath,
    args: input.args,
    workspaceRoot: input.workspaceRoot,
    launchThreadId: input.threadId,
    projectId: input.projectId,
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    intent: input.intent,
    origin: "recipe",
    ...prepared.bindings,
  });
  // The run is admitted, so the fact names a run that exists; a facts failure does not fail it.
  yield* prepared.deps
    .recordLaunchFact({
      threadId: input.threadId,
      runId: input.runId,
      recipe: { id: resolved.id, version: resolved.version, action: resolved.action },
    })
    .pipe(Effect.catch((error) => Effect.logWarning("recipe launch fact not recorded", { error })));
  return result;
});
