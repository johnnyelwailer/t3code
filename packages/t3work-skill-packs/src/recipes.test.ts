import { isRecipeApplicable, matchRecipes, type RecipeMatchInput } from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { getBundledT3WorkRecipe, listBundledT3WorkRecipes } from "./recipes.js";

function buildMatchInput(overrides: Partial<RecipeMatchInput> = {}): RecipeMatchInput {
  return {
    activeProject: { source: { provider: "atlassian" } },
    selectedResource: null,
    resourceKind: "ticket",
    availableIntegrations: ["atlassian"],
    surface: "workitem.detail.sidepanel",
    jiraIssueType: "Epic",
    enabledSkillPacks: ["delivery", "product", "engineering"],
    profile: {
      technicalDepth: "medium",
      brevity: "balanced",
      guidanceStyle: "balanced",
      detailDensity: "balanced",
      preferredArtifactKinds: ["estimation-notes"],
      defaultActionFamilies: ["delivery", "product"],
      defaultRecipeWeights: {},
    },
    availableContextKeys: ["ticket.summary", "project.summary"],
    ...overrides,
  };
}

describe("tshirt-size-epic bundled recipe", () => {
  it("is present in the bundled catalog", () => {
    expect(getBundledT3WorkRecipe("tshirt-size-epic")).toBeDefined();
    expect(listBundledT3WorkRecipes().some((recipe) => recipe.id === "tshirt-size-epic")).toBe(
      true,
    );
  });

  it("drives a bottom-up story estimate: code + Confluence, component count, hours, banded size, then a label", () => {
    const recipe = getBundledT3WorkRecipe("tshirt-size-epic")!;

    expect(recipe.promptTemplate).toContain("selected story");
    expect(recipe.promptTemplate).toContain("size the parent story as a whole");
    expect(recipe.promptTemplate).toContain("Search the current codebase");
    expect(recipe.promptTemplate).toContain("Confluence");
    expect(recipe.promptTemplate).toContain("total number of components changed");
    expect(recipe.promptTemplate).toContain("1 story point = 8 hours");
    expect(recipe.promptTemplate).toContain("acceptance criteria");
    // Fixed hour bands map total hours to a T-shirt size.
    expect(recipe.promptTemplate).toContain("XS = under 8h");
    expect(recipe.promptTemplate).toContain("XL = over 200h");
    // Size is surfaced as a ready-to-apply label, not written by the recipe.
    expect(recipe.promptTemplate).toContain("tshirt-<size>");
    expect(recipe.promptTemplate).toContain("does not write the label itself");
    expect(recipe.promptTemplate).toContain("unknowns");
    expect(recipe.artifactKinds).toEqual(["estimation-notes", "open-questions"]);
    expect(recipe.allowedToolGroups).toEqual(["integration.read", "artifact.rw", "ui.render"]);
    expect(recipe.requiredContext).toEqual(
      expect.arrayContaining([
        { key: "ticket.summary", description: "Story summary" },
        expect.objectContaining({ key: "project.codebase", optional: true }),
        expect.objectContaining({ key: "ticket.confluence", optional: true }),
        expect.objectContaining({ key: "ticket.relationship.linked", optional: true }),
        expect.objectContaining({ key: "ticket.github.pull-request", optional: true }),
      ]),
    );
  });

  it("is applicable for a Story and a Sub-task, regardless of whether it has children", () => {
    const recipe = getBundledT3WorkRecipe("tshirt-size-epic")!;
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: "Story" }))).toBe(true);
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: "Sub-task" }))).toBe(true);
    // No child-count predicate: a split story is still sizeable.
    expect(recipe.appliesTo.visiblePredicates).toBeUndefined();
    expect(
      isRecipeApplicable(
        recipe,
        buildMatchInput({ jiraIssueType: "Story", signals: { "workitem.hasChildren": true } }),
      ),
    ).toBe(true);
  });

  it("is NOT applicable for issue types outside stories/substories", () => {
    const recipe = getBundledT3WorkRecipe("tshirt-size-epic")!;
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: "Epic" }))).toBe(false);
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: "Bug" }))).toBe(false);
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: null }))).toBe(false);
  });

  it("surfaces via matchRecipes for a story and links the shape-next-backlog-slice follow-up", () => {
    const results = matchRecipes(
      listBundledT3WorkRecipes(),
      buildMatchInput({ jiraIssueType: "Story" }),
    );
    const match = results.find((result) => result.recipe.id === "tshirt-size-epic");
    expect(match).toBeDefined();
    expect(match?.recipe.suggestedActions?.map((action) => action.recipeId)).toContain(
      "shape-next-backlog-slice",
    );
  });
});
