/**
 * What a `t3team.orchestration.run` call names, checked before anything durable: a saved
 * `workflowPath` (pinned and source-checked) or a `recipe` by id (resolved with its bindings).
 * Neither means the host authors the run from `intent`.
 */
import type { ModelSelection, ProjectId, ServerProvider, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import * as RecipeRun from "./t3team-toolBrokerWorkflowRunRecipe.ts";
import { prepareDirectWorkflowLaunch } from "./t3team-workflowRunDirectLaunch.ts";

export const resolveRunTarget = Effect.fn("resolveRunTarget")(function* (input: {
  readonly recipeRun: RecipeRun.RecipeRunByIdDeps | undefined;
  readonly args: {
    readonly workflowPath?: string | undefined;
    readonly recipe?: string | undefined;
    readonly action?: string | undefined;
  };
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly runId: string;
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly providers: ReadonlyArray<ServerProvider> | undefined;
  readonly modelSelection: ModelSelection;
}) {
  const { fileSystem, path, workspaceRoot, runId } = input;
  const recipe = input.args.recipe?.trim() ?? "";
  const workflowPath = input.args.workflowPath?.trim() ?? "";
  return {
    recipeRun:
      recipe.length === 0
        ? undefined
        : yield* RecipeRun.prepareRecipeRun(input.recipeRun, {
            fileSystem,
            path,
            workspaceRoot,
            recipe,
            runId,
            action: input.args.action,
            threadId: input.threadId,
            projectId: input.projectId,
          }),
    pinnedPath:
      workflowPath.length === 0
        ? undefined
        : yield* prepareDirectWorkflowLaunch({
            fileSystem,
            path,
            workspaceRoot,
            runId,
            workflowPath,
            providers: input.providers,
            baseModelSelection: input.modelSelection,
          }),
  };
});
