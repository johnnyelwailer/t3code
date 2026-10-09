/**
 * G11: a recipe action addressed by id, resolved the way the recipe list resolves it — packs
 * first, then the project's own recipes, the project winning (`mergeRecipesByPrecedence`). An
 * unknown id or action fails closed; so does a prompt action (no workflow to run) and a
 * remote-managed pack recipe, which is listable but not yet executable.
 */
import * as Effect from "effect/Effect";

import { listProjectRecipesForAgent } from "./t3team-recipeAgentList.ts";
import { getPackRecipeSources } from "./t3team-packRecipeSources.ts";
import { DEFAULT_RECIPE_ACTION_NAME } from "./t3team-projectRecipeActions.ts";
import { EXECUTABLE_PACK_SCOPES } from "./t3team-workflowRunPackAuthorize.ts";

const samePath = (left: string, right: string) =>
  left.replace(/[\\/]+$/, "") === right.replace(/[\\/]+$/, "");

export interface RecipeRunTarget {
  readonly id: string;
  /** The pack's version for a pack recipe; absent for a project-local one. */
  readonly version: string | undefined;
  readonly action: string;
  readonly recipePath: string;
  readonly workflowPath: string;
  readonly source: "pack" | "project-local";
}

export const resolveRecipeActionById = Effect.fn("resolveRecipeActionById")(function* (input: {
  readonly workspaceRoot: string;
  readonly recipeId: string;
  readonly action?: string | undefined;
}) {
  const recipeId = input.recipeId.trim();
  const action = input.action?.trim() || DEFAULT_RECIPE_ACTION_NAME;
  const listed = yield* listProjectRecipesForAgent({ workspaceRoot: input.workspaceRoot });
  const recipe = listed.recipes.find((entry) => entry.id === recipeId);
  if (recipe === undefined) {
    const loadError = listed.errors.find((error) =>
      error.path.replace(/[\\/]+$/, "").endsWith(`/${recipeId}`),
    );
    return yield* Effect.fail(
      loadError === undefined
        ? `No recipe '${recipeId}' in this project.`
        : `Recipe '${recipeId}' failed to load: ${loadError.message}`,
    );
  }
  if (recipe.source === "pack" && !EXECUTABLE_PACK_SCOPES.has(recipe.packScope ?? "")) {
    return yield* Effect.fail(`Recipe '${recipeId}' comes from a pack that may not run yet.`);
  }
  const named = recipe.actions?.find((candidate) => candidate.name === action);
  const workflowPath =
    action === DEFAULT_RECIPE_ACTION_NAME ? recipe.workflowPath : named?.workflowPath;
  if (workflowPath === undefined) {
    const names = [
      ...(recipe.workflowPath === undefined ? [] : [DEFAULT_RECIPE_ACTION_NAME]),
      ...(recipe.actions ?? []).filter((a) => a.workflowPath !== undefined).map((a) => a.name),
    ];
    return yield* Effect.fail(
      named !== undefined ||
        (action === DEFAULT_RECIPE_ACTION_NAME && recipe.workflowPath === undefined)
        ? `Recipe '${recipeId}' action '${action}' is a prompt, not a workflow; runnable: ${names.join(", ") || "none"}.`
        : `Recipe '${recipeId}' has no action '${action}'; runnable: ${names.join(", ") || "none"}.`,
    );
  }
  return {
    id: recipe.id,
    version:
      recipe.source === "pack"
        ? getPackRecipeSources().sources.find((source) =>
            samePath(source.recipeRoot, recipe.recipePath),
          )?.packVersion
        : undefined,
    action,
    recipePath: recipe.recipePath,
    workflowPath,
    source: recipe.source,
  } satisfies RecipeRunTarget;
});
