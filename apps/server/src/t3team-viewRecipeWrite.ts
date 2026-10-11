import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { T3TEAM_PROJECT_RECIPES_ROOT } from "./t3team-projectSetupShared.ts";

export type WrittenViewRecipe = {
  readonly recipeId: string;
  readonly recipePath: string;
  /** Workspace-relative, the form `t3team.orchestration.run` takes as `workflowPath`. */
  readonly workflowPath: string;
};

const RECIPE_ID = /^[a-z][a-z0-9-]{0,40}$/;

/**
 * Write a rendered recipe under `<workspace>/.t3team/recipes/<id>/`. Project scope only: the
 * recipe engine has no user-global discovery root. Rewriting the same id replaces it.
 * Fails with a caller-facing message.
 */
export const writeViewRecipe = Effect.fn("t3team.viewRecipe.write")(function* (input: {
  readonly workspaceRoot: string;
  readonly id: string;
  readonly recipeTs: string;
  readonly workflowTs: string;
}) {
  if (!RECIPE_ID.test(input.id)) {
    return yield* Effect.fail("Recipe id must be a short kebab-case id.");
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(input.workspaceRoot);
  const dir = path.resolve(root, T3TEAM_PROJECT_RECIPES_ROOT, input.id);
  const relativeDir = path.relative(root, dir);
  if (relativeDir.startsWith("..") || path.isAbsolute(relativeDir)) {
    return yield* Effect.fail("Recipe path escapes the workspace.");
  }
  const workflowFile = `${input.id}.workflow.ts`;
  yield* Effect.gen(function* () {
    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.writeFileString(path.join(dir, "recipe.ts"), input.recipeTs);
    yield* fs.writeFileString(path.join(dir, workflowFile), input.workflowTs);
  }).pipe(Effect.mapError((error) => `Could not write the recipe: ${error.message}`));
  return {
    recipeId: input.id,
    recipePath: path.join(relativeDir, "recipe.ts"),
    workflowPath: path.join(relativeDir, workflowFile),
  } satisfies WrittenViewRecipe;
});
