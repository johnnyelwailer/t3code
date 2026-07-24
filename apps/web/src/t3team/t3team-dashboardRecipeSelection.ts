import type { T3TeamDashboardRecipeActionOutcome } from "~/t3team/t3team-dashboardRecipeActions";
import { resolveT3TeamDashboardRecipeAction } from "~/t3team/t3team-dashboardRecipeActions";
import type { T3TeamDashboardRecipeAction } from "~/t3team/t3team-dashboardRecipeActions";
import {
  applyT3TeamRecipeQuickStartLaunchCustomization,
  type T3TeamRecipeQuickStartLaunchCustomization,
  type T3TeamSelectedRecipeQuickStart,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipes";

export function buildProjectDashboardSelectedRecipe(input: {
  readonly recipe: T3TeamSidecarRecipeQuickStart;
  readonly customization?: T3TeamRecipeQuickStartLaunchCustomization;
  readonly runDashboardRecipeAction: (
    action: T3TeamDashboardRecipeAction,
  ) => T3TeamDashboardRecipeActionOutcome | null;
}): T3TeamSelectedRecipeQuickStart | null {
  const resolvedRecipe = applyT3TeamRecipeQuickStartLaunchCustomization(
    input.recipe,
    input.customization,
  );
  const dashboardAction = resolvedRecipe.workflow
    ? resolveT3TeamDashboardRecipeAction(resolvedRecipe.workflow.recipeId)
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
