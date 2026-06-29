import { describe, expect, it } from "vite-plus/test";

import { mergeSidecarRecipeQuickStarts } from "~/t3work/t3work-sidecarRecipeDiscoveryMapping";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";

function createQuickStart(
  id: string,
  source: NonNullable<T3workSidecarRecipeQuickStart["workflow"]>["source"] = "bundled",
): T3workSidecarRecipeQuickStart {
  return {
    id,
    title: id,
    description: `${id} description`,
    prompt: `${id} prompt`,
    workflow: {
      kind: "recipe",
      recipeId: id,
      title: id,
      description: `${id} description`,
      source,
      surface: "project.dashboard.backlog",
    },
  };
}

describe("mergeSidecarRecipeQuickStarts", () => {
  it("keeps bundled quick starts visible after project-local recipes load", () => {
    const merged = mergeSidecarRecipeQuickStarts(
      [
        createQuickStart("project-local-triage", "project-local"),
        createQuickStart("project-local-risk", "project-local"),
      ],
      [
        createQuickStart("prioritize-pending-work"),
        createQuickStart("shape-next-backlog-slice"),
        createQuickStart("create-contextual-recipe"),
        createQuickStart("create-recipe"),
      ],
      3,
    );

    expect(merged.map((quickStart) => quickStart.id)).toEqual([
      "project-local-triage",
      "project-local-risk",
      "prioritize-pending-work",
      "create-contextual-recipe",
      "create-recipe",
    ]);
  });

  it("prefers discovered recipes when a project-local recipe shadows a bundled id", () => {
    const merged = mergeSidecarRecipeQuickStarts(
      [createQuickStart("prioritize-pending-work", "project-local")],
      [
        createQuickStart("prioritize-pending-work", "bundled"),
        createQuickStart("create-contextual-recipe"),
      ],
      2,
    );

    expect(merged[0]?.workflow?.source).toBe("project-local");
    expect(merged.map((quickStart) => quickStart.id)).toEqual([
      "prioritize-pending-work",
      "create-contextual-recipe",
    ]);
  });
});
