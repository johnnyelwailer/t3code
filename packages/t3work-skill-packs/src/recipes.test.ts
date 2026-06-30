import { isRecipeApplicable, matchRecipes, type RecipeMatchInput } from "@t3tools/project-recipes";
import { recipeSignalPredicates } from "@t3tools/project-recipes";
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

const KEEP_PACK_META_RECIPE_IDS = [
  "create-recipe",
  "edit-plugin-module",
  "create-contextual-recipe",
  "explain-selected-work",
  "review-acceptance-criteria",
  "create-qa-test-plan",
  "prioritize-pending-work",
  "focus-needs-my-action",
  "show-only-assigned-to-me",
  "clear-filters",
  "shape-next-backlog-slice",
  "technical-implementation-plan",
  "unblock-blocked-ticket",
  "tshirt-size-epic",
] as const;

const RECIPE_TOPICS: Record<(typeof KEEP_PACK_META_RECIPE_IDS)[number], string> = {
  "create-recipe": "customize",
  "edit-plugin-module": "customize",
  "create-contextual-recipe": "customize",
  "explain-selected-work": "quick-actions",
  "review-acceptance-criteria": "qa",
  "create-qa-test-plan": "qa",
  "prioritize-pending-work": "planning",
  "clear-filters": "filters",
  "focus-needs-my-action": "filters",
  "show-only-assigned-to-me": "filters",
  "shape-next-backlog-slice": "refinement",
  "technical-implementation-plan": "engineering",
  "unblock-blocked-ticket": "delivery",
  "tshirt-size-epic": "refinement",
};

describe("bundled t3work recipe catalog", () => {
  it("keeps KEEP/PACK/META recipes with explicit topics", () => {
    expect(listBundledT3WorkRecipes().map((recipe) => recipe.id)).toEqual([
      ...KEEP_PACK_META_RECIPE_IDS,
    ]);
    for (const recipeId of KEEP_PACK_META_RECIPE_IDS) {
      expect(getBundledT3WorkRecipe(recipeId)?.topic).toBe(RECIPE_TOPICS[recipeId]);
    }
  });

  it("defines inline assignee filtering for show-only-assigned-to-me", () => {
    const recipe = getBundledT3WorkRecipe("show-only-assigned-to-me")!;

    expect(recipe.kickoff?.steps).toEqual([
      expect.objectContaining({
        kind: "tool",
        toolName: "t3work.backlog.set_assignee_filter",
        input: { mode: "current-user" },
      }),
    ]);
    expect(recipe.allowedToolGroups).toEqual(["view.state"]);
    expect(recipe.actionViewTemplate).toContain("Show only assigned to me");
    expect(recipe.topic).toBe("filters");
  });

  it("defines clear-filters for active dashboard slices", () => {
    const recipe = getBundledT3WorkRecipe("clear-filters")!;

    expect(recipe.topic).toBe("filters");
    expect(recipe.requiredContext?.map((entry) => entry.key)).toContain("dashboard.view.filtered");
    expect(recipe.surfaces).toEqual(["project.dashboard.backlog", "project.dashboard.myWork"]);
  });

  it("defines ticket-depth acceptance review for workitem sidepanel", () => {
    const recipe = getBundledT3WorkRecipe("review-acceptance-criteria")!;

    expect(recipe.surfaces).toEqual(["workitem.detail.sidepanel"]);
    expect(recipe.promptTemplate).toContain("acceptance criteria");
    expect(recipe.actionViewTemplate).toContain("Review acceptance criteria");
    expect(recipe.topic).toBe("qa");
  });
});
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
