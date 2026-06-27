import type { T3workDashboardRecipeActionOutcome } from "~/t3work/t3work-dashboardRecipeActions";
import { resolveT3workDashboardRecipeAction } from "~/t3work/t3work-dashboardRecipeActions";
import type { T3workDashboardRecipeAction } from "~/t3work/t3work-dashboardRecipeActions";
import {
  applyT3workRecipeQuickStartLaunchCustomization,
  type T3workRecipeQuickStartLaunchCustomization,
  type T3workSelectedRecipeQuickStart,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";

export function buildProjectDashboardSelectedRecipe(input: {
  readonly recipe: T3workSidecarRecipeQuickStart;
  readonly customization?: T3workRecipeQuickStartLaunchCustomization;
  readonly runDashboardRecipeAction: (
    action: T3workDashboardRecipeAction,
  ) => T3workDashboardRecipeActionOutcome | null;
}): T3workSelectedRecipeQuickStart | null {
  const resolvedRecipe = applyT3workRecipeQuickStartLaunchCustomization(
    input.recipe,
    input.customization,
  );
  const dashboardAction = resolvedRecipe.workflow
    ? resolveT3workDashboardRecipeAction(resolvedRecipe.workflow.recipeId)
    : null;
  const actionOutcome = dashboardAction ? input.runDashboardRecipeAction(dashboardAction) : null;

  if (dashboardAction && actionOutcome?.applied !== true) {
    return null;
  }

  return {
    recipe: actionOutcome?.promptText
      ? {
          ...resolvedRecipe,
          prompt: `${resolvedRecipe.prompt}\n\nDeterministic view change applied:\n- ${actionOutcome.promptText}`,
        }
      : resolvedRecipe,
    ...(input.customization ? { customization: input.customization } : {}),
  };
}
