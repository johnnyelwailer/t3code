import { isRecipeApplicable, matchRecipes, type RecipeMatchInput } from "@t3tools/project-recipes";
import { recipeSignalPredicates } from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { buildBundledActionPlacement } from "./actionPlacements.js";
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

  it("asks for a multi-source estimate grounded in Jira, code, precedent work, and unknowns", () => {
    const recipe = getBundledT3WorkRecipe("tshirt-size-epic")!;

    expect(recipe.promptTemplate).toContain("multi-source estimate");
    expect(recipe.promptTemplate).toContain("child stories/subtasks");
    expect(recipe.promptTemplate).toContain("linked or precedent stories and epics");
    expect(recipe.promptTemplate).toContain("current codebase implementation state");
    expect(recipe.promptTemplate).toContain("acceptance criteria");
    expect(recipe.promptTemplate).toContain("unknowns");
    expect(recipe.artifactKinds).toEqual(["estimation-notes", "open-questions"]);
    expect(recipe.allowedToolGroups).toEqual(["integration.read", "artifact.rw", "ui.render"]);
    expect(recipe.requiredContext).toEqual(
      expect.arrayContaining([
        { key: "ticket.summary", description: "Epic summary" },
        expect.objectContaining({ key: "ticket.relationship.children", optional: true }),
        expect.objectContaining({ key: "ticket.relationship.linked", optional: true }),
        expect.objectContaining({ key: "ticket.github.pull-request", optional: true }),
      ]),
    );
  });

  it("is applicable for an Epic on workitem.detail.sidepanel when the epic has no children", () => {
    const recipe = getBundledT3WorkRecipe("tshirt-size-epic")!;
    expect(
      isRecipeApplicable(recipe, buildMatchInput({ signals: { "workitem.hasChildren": false } })),
    ).toBe(true);
  });

  it("waits for known child signals before applying the no-children predicate", () => {
    const recipe = getBundledT3WorkRecipe("tshirt-size-epic")!;
    expect(
      isRecipeApplicable(recipe, buildMatchInput({ surface: "project.dashboard.backlog" })),
    ).toBe(false);
    expect(recipe.appliesTo.visiblePredicates).toEqual(
      recipeSignalPredicates.workitemHasNoChildren,
    );
  });

  it("is NOT applicable for non-epic issue types", () => {
    const recipe = getBundledT3WorkRecipe("tshirt-size-epic")!;
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: "Story" }))).toBe(false);
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: "Bug" }))).toBe(false);
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: null }))).toBe(false);
  });

  it("is hidden via matchRecipes when the epic already has children", () => {
    const results = matchRecipes(
      listBundledT3WorkRecipes(),
      buildMatchInput({ signals: { "workitem.hasChildren": true } }),
    );
    expect(results.map((result) => result.recipe.id)).not.toContain("tshirt-size-epic");
  });

  it("surfaces via matchRecipes for an un-sized epic and links the shape-next-backlog-slice follow-up", () => {
    const results = matchRecipes(
      listBundledT3WorkRecipes(),
      buildMatchInput({ signals: { "workitem.hasChildren": false } }),
    );
    const match = results.find((result) => result.recipe.id === "tshirt-size-epic");
    expect(match).toBeDefined();
    expect(match?.recipe.suggestedActions?.map((action) => action.recipeId)).toContain(
      "shape-next-backlog-slice",
    );
  });
});

describe("bundled action views run through the defineAction gate", () => {
  it("gives every recipe with an action view a decoded `action` placement", () => {
    const withViews = listBundledT3WorkRecipes().filter(
      (recipe) => recipe.actionViewTemplate !== undefined,
    );
    expect(withViews.length).toBeGreaterThan(0);
    for (const recipe of withViews) {
      const placement = recipe.actionPlacement;
      expect(placement, `recipe ${recipe.id} has no gated action placement`).toBeDefined();
      expect(placement?.id).toBe(`${recipe.id}.action`);
      expect(placement?.recipeId).toBe(recipe.id);
      expect(placement?.version).toBe(recipe.version);
      expect(placement?.surfaces).toEqual(recipe.surfaces);
      // The template the web layer compiles is the gated view itself, not a second copy.
      expect(recipe.actionViewTemplate).toBe(placement?.view);
      expect(placement?.view).toMatch(/export\s+default\b/);
    }
  });

  it("leaves recipes without an action view unplaced", () => {
    for (const recipe of listBundledT3WorkRecipes()) {
      if (recipe.actionViewTemplate === undefined) {
        expect(recipe.actionPlacement).toBeUndefined();
      }
    }
  });

  it("rejects a launcher view with no default export", () => {
    expect(() =>
      buildBundledActionPlacement({
        id: "broken-recipe",
        version: "0.1.0",
        surfaces: ["project.dashboard.backlog"],
        view: "function Action() { return null; }",
      }),
    ).toThrow(/default export/);
  });

  it("rejects a launcher with no surfaces", () => {
    expect(() =>
      buildBundledActionPlacement({
        id: "surfaceless-recipe",
        version: "0.1.0",
        surfaces: [],
        view: "export default function Action() { return null; }",
      }),
    ).toThrow(/no surfaces/);
  });
});

describe("bundled recipe slash aliases", () => {
  it("exposes the documented aliases for the demonstrable recipes", () => {
    expect(getBundledT3WorkRecipe("create-qa-test-plan")?.slashAlias).toBe("qa-plan");
    expect(getBundledT3WorkRecipe("explain-selected-work")?.slashAlias).toBe("explain");
  });

  it("keeps every declared alias in the documented `[a-z0-9][a-z0-9-]*` format and unique", () => {
    const aliases = listBundledT3WorkRecipes()
      .map((recipe) => recipe.slashAlias)
      .filter((alias): alias is string => typeof alias === "string");
    for (const alias of aliases) {
      expect(alias).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});
