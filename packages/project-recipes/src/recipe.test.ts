import { describe, expect, it } from "vitest";

import { matchRecipes, type Recipe } from "./recipe.js";

const RECIPES: ReadonlyArray<Recipe> = [
  {
    id: "technical-implementation-plan",
    title: "Draft implementation plan",
    shortDescription: "Break the work into technical steps with verification guidance.",
    surfaces: ["workitem.detail.sidepanel"],
    promptTemplate: "Create a technical implementation plan for {{selectedWorkLabel}}.",
    appliesTo: {
      resourceKinds: ["ticket"],
      projectSourceKinds: ["atlassian"],
      guidanceStyles: ["expert"],
      technicalDepths: ["high"],
      requiredSkillPackIds: ["engineering"],
    },
    requiredContext: [
      { key: "ticket.summary", description: "Ticket summary" },
      { key: "ticket.description", description: "Ticket description", optional: true },
    ],
    skillRef: { id: "engineering.plan" },
    outputPreference: "plan",
    artifactKinds: ["implementation-plan", "technical-checklist"],
    actionFamilies: ["engineering"],
    rankHint: 20,
  },
  {
    id: "explain-selected-work",
    title: "Explain this simply",
    shortDescription: "Summarize the selected work in plain language.",
    surfaces: [
      "project.dashboard.backlog",
      "project.dashboard.myWork",
      "workitem.detail.sidepanel",
    ],
    promptTemplate: "Explain {{selectedWorkLabel}} in plain language.",
    appliesTo: {
      projectSourceKinds: ["atlassian", "github"],
    },
    requiredContext: [{ key: "project.summary", description: "Project summary" }],
    skillRef: { id: "summary.explain" },
    outputPreference: "markdown",
    artifactKinds: ["summary"],
    actionFamilies: ["summary"],
    rankHint: 5,
  },
  {
    id: "support-escalation-summary",
    title: "Create escalation summary",
    shortDescription: "Draft a support-ready escalation summary for the current issue.",
    surfaces: ["workitem.detail.sidepanel"],
    promptTemplate: "Create a support escalation summary for {{selectedWorkLabel}}.",
    appliesTo: {
      resourceKinds: ["ticket"],
      requiredSkillPackIds: ["support"],
      technicalDepths: ["low", "medium"],
    },
    requiredContext: [{ key: "ticket.summary", description: "Ticket summary" }],
    skillRef: { id: "support.escalate" },
    outputPreference: "comment",
    artifactKinds: ["escalation-summary"],
    actionFamilies: ["support"],
  },
];

describe("matchRecipes", () => {
  it("prefers recipes that align with the active profile and enabled skill packs", () => {
    const results = matchRecipes(RECIPES, {
      activeProject: { source: { provider: "atlassian" } },
      selectedResource: null,
      resourceKind: "ticket",
      availableIntegrations: ["atlassian"],
      surface: "workitem.detail.sidepanel",
      jiraIssueType: "Story",
      enabledSkillPacks: ["engineering", "release"],
      profile: {
        technicalDepth: "high",
        brevity: "balanced",
        guidanceStyle: "expert",
        detailDensity: "expert",
        preferredArtifactKinds: ["implementation-plan", "technical-checklist"],
        defaultActionFamilies: ["engineering", "release"],
        defaultRecipeWeights: {
          "technical-implementation-plan": 25,
        },
      },
      availableContextKeys: ["ticket.summary", "project.summary"],
    });

    expect(results.map((result) => result.recipe.id)).toEqual([
      "technical-implementation-plan",
      "explain-selected-work",
    ]);
    expect(results[0]?.reason).toContain("default action families");
    expect(results[0]?.missingContext).toEqual([]);
  });

  it("filters out recipes that do not match the surface, profile, or enabled skill packs", () => {
    const results = matchRecipes(RECIPES, {
      activeProject: { source: { provider: "atlassian" } },
      selectedResource: null,
      resourceKind: "ticket",
      availableIntegrations: ["atlassian"],
      surface: "workitem.detail.sidepanel",
      jiraIssueType: "Bug",
      enabledSkillPacks: ["qa"],
      profile: {
        technicalDepth: "low",
        brevity: "short",
        guidanceStyle: "guided",
        detailDensity: "guided",
        preferredArtifactKinds: ["test-matrix"],
        defaultActionFamilies: ["qa"],
        defaultRecipeWeights: {},
      },
      availableContextKeys: ["ticket.summary", "project.summary"],
    });

    expect(results.map((result) => result.recipe.id)).toEqual(["explain-selected-work"]);
  });

  it("reports missing required context without hiding an otherwise applicable recipe", () => {
    const results = matchRecipes(RECIPES, {
      activeProject: { source: { provider: "atlassian" } },
      selectedResource: null,
      resourceKind: "ticket",
      availableIntegrations: ["atlassian"],
      surface: "workitem.detail.sidepanel",
      jiraIssueType: "Story",
      enabledSkillPacks: ["engineering"],
      profile: {
        technicalDepth: "high",
        brevity: "balanced",
        guidanceStyle: "expert",
        detailDensity: "expert",
        preferredArtifactKinds: ["implementation-plan"],
        defaultActionFamilies: ["engineering"],
        defaultRecipeWeights: {},
      },
      availableContextKeys: ["project.summary"],
    });

    expect(results[0]?.recipe.id).toBe("technical-implementation-plan");
    expect(results[0]?.missingContext).toEqual(["ticket.summary"]);
  });
});
