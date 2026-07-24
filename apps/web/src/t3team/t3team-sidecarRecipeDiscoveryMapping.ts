import type {
  ProjectRecipeDiscovered,
  ProjectRecipeRenderContext,
  RecipeSurface,
} from "@t3tools/project-recipes";

import { buildT3TeamActionRecipeLaunchContext } from "~/t3team/t3team-actionRecipeLaunchContext";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

const PINNED_T3TEAM_META_QUICK_START_IDS = new Set(["create-contextual-recipe", "create-recipe"]);

export function buildPinnedQuickStartSelection<
  T extends { readonly recipe: { readonly id: string } },
>(matches: ReadonlyArray<T>, limit: number): ReadonlyArray<T> {
  const pinned: Array<T> = [];
  const regular: Array<T> = [];
  for (const match of matches) {
    if (PINNED_T3TEAM_META_QUICK_START_IDS.has(match.recipe.id)) {
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
): ReadonlyArray<T3TeamSidecarRecipeQuickStart> {
  const launchContext = buildT3TeamActionRecipeLaunchContext(renderContext);
  const visibleRecipes = buildPinnedQuickStartSelection(
    recipes.map((recipe) => ({ recipe })),
    limit ?? 5,
  ).map((entry) => entry.recipe);

  return visibleRecipes.map((recipe) => {
    const quickStart: T3TeamSidecarRecipeQuickStart = {
      id: recipe.id,
      title: recipe.displayName,
      description: recipe.shortDescription,
      prompt: recipe.prompt,
      ...(recipe.sourcePath ? { sourcePath: recipe.sourcePath } : {}),
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
  preferredQuickStarts: ReadonlyArray<T3TeamSidecarRecipeQuickStart>,
  fallbackQuickStarts: ReadonlyArray<T3TeamSidecarRecipeQuickStart>,
  limit: number | undefined,
): ReadonlyArray<T3TeamSidecarRecipeQuickStart> {
  const quickStartsById = new Map<string, T3TeamSidecarRecipeQuickStart>();

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
