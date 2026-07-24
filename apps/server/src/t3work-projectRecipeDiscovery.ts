import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { normalizeQueryable } from "@t3tools/project-context";
import {
  type DiscoverProjectRecipesResponse,
  type ProjectRecipeDiscovered,
  type ProjectRecipeRenderContext,
} from "@t3tools/project-recipes";

import { discoverPackRecipes } from "./t3work-projectRecipeDiscoveryPack.ts";
import { discoverProjectRecipeAtPath, sortRecipes } from "./t3work-projectRecipeDiscoveryRecipe.ts";
import { mergeRecipesByPrecedence } from "./t3work-projectRecipeOrigin.ts";
import { T3WORK_PROJECT_RECIPES_ROOT } from "./t3work-projectSetupShared.ts";

function normalizeRenderContext(context: ProjectRecipeRenderContext): ProjectRecipeRenderContext {
  return {
    ...context,
    linkedResources: normalizeQueryable(context.linkedResources),
    artifacts: normalizeQueryable(context.artifacts),
    ...(context.contextAttachments
      ? { contextAttachments: normalizeQueryable(context.contextAttachments) }
      : {}),
    availableContextKeys: normalizeQueryable(context.availableContextKeys),
  };
}

/** Apply the cross-source precedence merge and the existing rank/name sort in one place. */
function finalize(input: {
  readonly workspaceRoot: string;
  readonly hasProjectLocalRecipes: boolean;
  readonly recipes: ReadonlyArray<ProjectRecipeDiscovered>;
  readonly diagnostics: ReadonlyArray<string>;
}): DiscoverProjectRecipesResponse {
  const merged = mergeRecipesByPrecedence(input.recipes);
  const diagnostics = [...input.diagnostics, ...merged.diagnostics];
  return {
    workspaceRoot: input.workspaceRoot,
    hasProjectLocalRecipes: input.hasProjectLocalRecipes,
    recipes: merged.recipes.toSorted(sortRecipes),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

export const discoverProjectRecipes = Effect.fn("discoverProjectRecipes")(function* (input: {
  readonly workspaceRoot: string;
  readonly context: ProjectRecipeRenderContext;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const workspaceRoot = pathService.resolve(input.workspaceRoot);
  const context = normalizeRenderContext(input.context);
  // Pack-provided recipes are the same concept with a different source (Epic 16 §Recipe Sources
  // And Precedence), so they are discovered even when the workspace has no `.t3work/recipes/`.
  const packDiscovery = yield* discoverPackRecipes({ context });

  const recipesRoot = pathService.join(workspaceRoot, T3WORK_PROJECT_RECIPES_ROOT);
  if (!(yield* fileSystem.exists(recipesRoot).pipe(Effect.orElseSucceed(() => false)))) {
    return finalize({
      workspaceRoot,
      hasProjectLocalRecipes: false,
      recipes: packDiscovery.recipes,
      diagnostics: packDiscovery.diagnostics,
    });
  }

  const recipeEntries = yield* fileSystem.readDirectory(recipesRoot, { recursive: false });
  const discoveredRecipes: ProjectRecipeDiscovered[] = [];
  let hasProjectLocalRecipes = false;

  for (const entry of recipeEntries) {
    const recipePath = pathService.join(recipesRoot, entry);
    const entryStat = yield* fileSystem
      .stat(recipePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!entryStat || entryStat.type !== "Directory") {
      continue;
    }
    const maybeRecipe = yield* discoverProjectRecipeAtPath({
      workspaceRoot,
      recipePath,
      context,
    }).pipe(Effect.catch(() => Effect.succeed(Option.none<ProjectRecipeDiscovered>())));

    if (
      (yield* fileSystem
        .exists(pathService.join(recipePath, "recipe.json"))
        .pipe(Effect.orElseSucceed(() => false))) ||
      (yield* fileSystem
        .exists(pathService.join(recipePath, "recipe.ts"))
        .pipe(Effect.orElseSucceed(() => false)))
    ) {
      hasProjectLocalRecipes = true;
    }

    if (Option.isSome(maybeRecipe)) {
      discoveredRecipes.push(maybeRecipe.value);
    }
  }

  return finalize({
    workspaceRoot,
    hasProjectLocalRecipes,
    // Pack recipes first so a project-local recipe of the same id wins the merge below.
    recipes: [...packDiscovery.recipes, ...discoveredRecipes],
    diagnostics: packDiscovery.diagnostics,
  });
});
