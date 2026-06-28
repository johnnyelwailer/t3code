import { describe, expect, it } from "vite-plus/test";

import { buildProjectDashboardSelectedRecipe } from "~/t3work/t3work-dashboardRecipeSelection";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";

function createQuickStart(
  overrides: Partial<T3workSidecarRecipeQuickStart> = {},
): T3workSidecarRecipeQuickStart {
  return {
    id: "explain-selected-work",
    title: "Explain this simply",
    description: "Summarize the selected work.",
    prompt: "Explain this simply.",
    ...overrides,
  };
}

describe("buildProjectDashboardSelectedRecipe", () => {
  it("stages chat starters without running inline dashboard filter actions", () => {
    const selected = buildProjectDashboardSelectedRecipe({
      recipe: createQuickStart(),
    });

    expect(selected.recipe.id).toBe("explain-selected-work");
    expect(selected.recipe.prompt).toBe("Explain this simply.");
  });

  it("stages rank-next chat for focus-needs-my-action without applying filters inline", () => {
    const selected = buildProjectDashboardSelectedRecipe({
      recipe: createQuickStart({
        id: "focus-needs-my-action",
        title: "Show what needs my action",
        description: "Filter the current view to the work most likely waiting on you.",
        prompt: "Rank what needs my action next.",
      }),
    });

    expect(selected.recipe.id).toBe("focus-needs-my-action");
    expect(selected.recipe.prompt).toBe("Rank what needs my action next.");
  });
});
