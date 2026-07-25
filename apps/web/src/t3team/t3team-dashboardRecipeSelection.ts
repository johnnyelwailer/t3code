import {
  applyT3TeamRecipeQuickStartLaunchCustomization,
  type T3TeamRecipeQuickStartLaunchCustomization,
  type T3TeamSelectedRecipeQuickStart,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipes";

export function buildProjectDashboardSelectedRecipe(input: {
  readonly recipe: T3TeamSidecarRecipeQuickStart;
  readonly customization?: T3TeamRecipeQuickStartLaunchCustomization;
}): T3TeamSelectedRecipeQuickStart {
  return {
    recipe: applyT3TeamRecipeQuickStartLaunchCustomization(input.recipe, input.customization),
    ...(input.customization ? { customization: input.customization } : {}),
  };
}
