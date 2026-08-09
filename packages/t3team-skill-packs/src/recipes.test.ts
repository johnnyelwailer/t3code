import {
  isRecipeApplicable,
  matchRecipes,
  type ProjectRecipeRenderContext,
  type RecipeMatchInput,
} from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { buildBundledActionPlacement } from "./actionPlacements.js";
import { getBundledT3TeamRecipe, listBundledT3TeamRecipes } from "./recipes.js";

/** Minimal render context carrying relationship data a recipe's `visible` filter can read. */
function contextWithChildren(childKeys: ReadonlyArray<string>) {
  return {
    surface: "workitem.detail.sidepanel",
    project: { title: "Alpha", provider: "atlassian" },
    workitem: {
      kind: "ticket",
      type: "Epic",
      relationships: {
        childKeys: [...childKeys],
        referenceKeys: [],
        blockedByKeys: [],
        blockingKeys: [],
      },
    },
    // The filter under test reads only `workitem.relationships`; the rest is structural filler.
    profile: { technicalDepth: "medium", brevity: "balanced", guidanceStyle: "balanced" },
    enabledSkillPacks: [],
    schema: {},
  } as unknown as ProjectRecipeRenderContext;
}

/** Relationships absent entirely = host has not enriched them yet. */
function contextWithoutRelationships() {
  const base = contextWithChildren([]) as { workitem?: Record<string, unknown> };
  return {
    ...base,
    workitem: { kind: "ticket", type: "Epic" },
  } as unknown as ProjectRecipeRenderContext;
}

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
    expect(getBundledT3TeamRecipe("tshirt-size-epic")).toBeDefined();
    expect(listBundledT3TeamRecipes().some((recipe) => recipe.id === "tshirt-size-epic")).toBe(
      true,
    );
  });

  it("asks for a multi-source estimate grounded in Jira, code, precedent work, and unknowns", () => {
    const recipe = getBundledT3TeamRecipe("tshirt-size-epic")!;

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
    const recipe = getBundledT3TeamRecipe("tshirt-size-epic")!;
    expect(
      isRecipeApplicable(recipe, buildMatchInput({ renderContext: contextWithChildren([]) })),
    ).toBe(true);
  });

  it("waits for known relationships before applying the no-children rule", () => {
    const recipe = getBundledT3TeamRecipe("tshirt-size-epic")!;
    // `workitemHasChildren` left undefined = not enriched yet, which must NOT satisfy the rule.
    // No render context at all, and relationships absent: both must hide it rather than assume.
    expect(isRecipeApplicable(recipe, buildMatchInput({}))).toBe(false);
    expect(
      isRecipeApplicable(recipe, buildMatchInput({ renderContext: contextWithoutRelationships() })),
    ).toBe(false);
    expect(typeof recipe.visible).toBe("function");
  });

  it("is NOT applicable for non-epic issue types", () => {
    const recipe = getBundledT3TeamRecipe("tshirt-size-epic")!;
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: "Story" }))).toBe(false);
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: "Bug" }))).toBe(false);
    expect(isRecipeApplicable(recipe, buildMatchInput({ jiraIssueType: null }))).toBe(false);
  });

  it("is hidden via matchRecipes when the epic already has children", () => {
    const results = matchRecipes(
      listBundledT3TeamRecipes(),
      buildMatchInput({ renderContext: contextWithChildren(["ALPHA-2"]) }),
    );
    expect(results.map((result) => result.recipe.id)).not.toContain("tshirt-size-epic");
  });

  it("surfaces via matchRecipes for an un-sized epic and links the shape-next-backlog-slice follow-up", () => {
    const results = matchRecipes(
      listBundledT3TeamRecipes(),
      buildMatchInput({ renderContext: contextWithChildren([]) }),
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
    const withViews = listBundledT3TeamRecipes().filter(
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
    for (const recipe of listBundledT3TeamRecipes()) {
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
    expect(getBundledT3TeamRecipe("create-qa-test-plan")?.slashAlias).toBe("qa-plan");
    expect(getBundledT3TeamRecipe("explain-selected-work")?.slashAlias).toBe("explain");
  });

  it("keeps every declared alias in the documented `[a-z0-9][a-z0-9-]*` format and unique", () => {
    const aliases = listBundledT3TeamRecipes()
      .map((recipe) => recipe.slashAlias)
      .filter((alias): alias is string => typeof alias === "string");
    for (const alias of aliases) {
      expect(alias).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});
