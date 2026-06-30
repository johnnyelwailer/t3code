import {
  applyT3workRecipeQuickStartLaunchCustomization,
  type T3workRecipeQuickStartLaunchCustomization,
  type T3workSelectedRecipeQuickStart,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";

export function buildProjectDashboardSelectedRecipe(input: {
  readonly recipe: T3workSidecarRecipeQuickStart;
  readonly customization?: T3workRecipeQuickStartLaunchCustomization;
}): T3workSelectedRecipeQuickStart {
  return {
    recipe: applyT3workRecipeQuickStartLaunchCustomization(input.recipe, input.customization),
    ...(input.customization ? { customization: input.customization } : {}),
  };
}
