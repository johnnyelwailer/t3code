import type {
  ProjectRecipeDiscovered,
  ProjectRecipeRenderContext,
  RecipeSurface,
} from "@t3tools/project-recipes";

import { buildT3workActionRecipeLaunchContext } from "~/t3work/t3work-actionRecipeLaunchContext";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

const PINNED_T3WORK_META_QUICK_START_IDS = new Set(["create-contextual-recipe", "create-recipe"]);

export function buildPinnedQuickStartSelection<
  T extends { readonly recipe: { readonly id: string } },
>(matches: ReadonlyArray<T>, limit: number): ReadonlyArray<T> {
  const pinned: Array<T> = [];
  const regular: Array<T> = [];
  for (const match of matches) {
    if (PINNED_T3WORK_META_QUICK_START_IDS.has(match.recipe.id)) {
      pinned.push(match);
    } else {
      regular.push(match);
    }
  }
  return [...regular.slice(0, limit), ...pinned];
}

export function mapDiscoveredRecipesToQuickStarts(
  recipes: ReadonlyArray<ProjectRecipeDiscovered>,
  surface: RecipeSurface,
  limit: number | undefined,
  renderContext: ProjectRecipeRenderContext,
): ReadonlyArray<T3workSidecarRecipeQuickStart> {
  const launchContext = buildT3workActionRecipeLaunchContext(renderContext);
  const visibleRecipes = buildPinnedQuickStartSelection(
    recipes.map((recipe) => ({ recipe })),
    limit ?? 5,
  ).map((entry) => entry.recipe);

  return visibleRecipes.map((recipe) => {
    const quickStart: T3workSidecarRecipeQuickStart = {
      id: recipe.id,
      title: recipe.displayName,
      description: recipe.shortDescription,
      prompt: recipe.prompt,
      workflow: {
        kind: "recipe",
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        ...(recipe.kickoff ? { kickoff: recipe.kickoff } : {}),
        title: recipe.displayName,
        description: recipe.shortDescription,
        source: recipe.source,
        surface,
        launchContext,
        ...(recipe.reason ? { reason: recipe.reason } : {}),
        recipePath: recipe.recipePath,
        promptPath: recipe.promptPath,
        ...(recipe.workflowPath ? { workflowPath: recipe.workflowPath } : {}),
        allowedToolGroups: recipe.allowedToolGroups,
      },
    };

    return recipe.actionViewSource
      ? Object.assign(quickStart, {
          actionView: {
            source: recipe.actionViewSource,
            ...(recipe.actionViewPath ? { path: recipe.actionViewPath } : {}),
            context: renderContext,
          },
        })
      : quickStart;
  });
}

export function mergeSidecarRecipeQuickStarts(
  preferredQuickStarts: ReadonlyArray<T3workSidecarRecipeQuickStart>,
  fallbackQuickStarts: ReadonlyArray<T3workSidecarRecipeQuickStart>,
  limit: number | undefined,
): ReadonlyArray<T3workSidecarRecipeQuickStart> {
  const quickStartsById = new Map<string, T3workSidecarRecipeQuickStart>();

  for (const quickStart of preferredQuickStarts) {
    quickStartsById.set(quickStart.id, quickStart);
  }
  for (const quickStart of fallbackQuickStarts) {
    if (!quickStartsById.has(quickStart.id)) {
      quickStartsById.set(quickStart.id, quickStart);
    }
  }

  return buildPinnedQuickStartSelection(
    Array.from(quickStartsById.values()).map((quickStart) => ({
      recipe: { id: quickStart.id },
      quickStart,
    })),
    limit ?? 5,
  ).map((entry) => entry.quickStart);
}
