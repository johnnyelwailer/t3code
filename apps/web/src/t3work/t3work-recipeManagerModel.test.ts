import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ManagedProjectRecipe } from "@t3tools/project-recipes";

import {
  buildRecipeManagerChatRequest,
  groupManagedProjectRecipesByTopic,
  RECIPE_MANAGER_DEFAULT_TOPIC,
  sortManagedProjectRecipes,
} from "~/t3work/t3work-recipeManagerModel";

const project = {
  id: "project-1",
  title: "Project One",
  source: { provider: "local" },
  workspace: { rootPath: "/workspace/project-one" },
} as ProjectShellProject;

function recipe(input: Partial<ManagedProjectRecipe>): ManagedProjectRecipe {
  return {
    id: "recipe",
    version: "1.0.0",
    displayName: "Recipe",
    shortDescription: "Recipe description",
    surfaces: ["project.dashboard.backlog"],
    active: true,
    sourceKind: "recipe-json",
    editable: true,
    deletable: true,
    recipePath: "/workspace/project-one/.t3work/recipes/recipe",
    sourcePath: "/workspace/project-one/.t3work/recipes/recipe/recipe.json",
    ...input,
  };
}

describe("recipe manager model", () => {
  it("sorts active editable recipes first", () => {
    const sorted = sortManagedProjectRecipes([
      recipe({ displayName: "Module", active: true, editable: false }),
      recipe({ displayName: "Off", active: false, editable: true }),
      recipe({ displayName: "Editable", active: true, editable: true }),
    ]);

    expect(sorted.map((entry) => entry.displayName)).toEqual(["Editable", "Module", "Off"]);
  });

  it("groups recipes by topic with a general fallback", () => {
    const grouped = groupManagedProjectRecipesByTopic([
      recipe({ displayName: "Release", topic: "Release" }),
      recipe({ displayName: "Retro", topic: "Team rituals" }),
      recipe({ displayName: "Untitled" }),
    ]);

    expect(grouped.map((group) => group.topic)).toEqual(["Release", "Team rituals", RECIPE_MANAGER_DEFAULT_TOPIC]);
    expect(grouped[1]?.recipes.map((entry) => entry.displayName)).toEqual(["Retro"]);
  });

  it("builds chat context for recipe changes", () => {
    const request = buildRecipeManagerChatRequest({
      project,
      recipe: recipe({
        id: "release-checklist",
        displayName: "Release checklist",
        prompt: "Prepare a checklist.",
      }),
    });

    expect(request.kind).toBe("project-recipe");
    expect(request.projectWorkspaceRoot).toBe("/workspace/project-one");
    expect(request.summaryItems).toContainEqual({ label: "Recipe", value: "release-checklist" });
    expect(request.payload).toMatchObject({
      kind: "project-recipe",
      id: "release-checklist",
      prompt: "Prepare a checklist.",
    });
  });
});
