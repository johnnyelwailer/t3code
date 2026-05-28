import { describe, expect, it } from "vitest";
import { createQueryable, type ProjectShellProject } from "@t3tools/project-context";
import { getBundledT3WorkRecipe } from "@t3tools/t3work-skill-packs";

import {
  DEFAULT_T3WORK_SELECTED_RECIPE_HELPER_TEXT,
  DEFAULT_T3WORK_SELECTED_RECIPE_PLACEHOLDER,
  applyT3workRecipeQuickStartLaunchCustomization,
  buildT3workSelectedRecipeKickoffLaunch,
  buildT3workSelectedRecipeKickoffMessage,
  describeT3workSelectedRecipeQuickStart,
  getT3workSelectedRecipeComposerHelperText,
  getT3workSelectedRecipeComposerPlaceholder,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";

function createProject(): ProjectShellProject {
  return {
    id: "project-alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      externalProjectId: "PA",
      raw: {},
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

describe("applyT3workRecipeQuickStartLaunchCustomization", () => {
  it("appends launch guidance and persists structured workflow parameters", () => {
    const recipe = {
      id: "technical-implementation-plan",
      title: "Draft implementation plan",
      description: "Map sequencing and validation.",
      prompt: "Draft an implementation plan.",
      workflow: {
        kind: "recipe" as const,
        recipeId: "technical-implementation-plan",
        title: "Draft implementation plan",
        description: "Map sequencing and validation.",
        source: "bundled" as const,
        surface: "workitem.detail.sidepanel" as const,
      },
    };

    const customized = applyT3workRecipeQuickStartLaunchCustomization(recipe, {
      selections: [
        {
          name: "planDepth",
          label: "Depth",
          value: "detailed",
          displayValue: "Detailed",
          promptText: "Expand the plan with failure modes, validation, and rollout considerations.",
        },
        {
          name: "focusArea",
          label: "Extra focus",
          value: "cache invalidation",
          displayValue: "cache invalidation",
        },
      ],
    });

    expect(customized.prompt).toContain("Draft an implementation plan.");
    expect(customized.prompt).toContain("Additional launch guidance:");
    expect(customized.prompt).toContain(
      "Expand the plan with failure modes, validation, and rollout considerations.",
    );
    expect(customized.prompt).toContain("Extra focus: cache invalidation");
    expect(customized.workflow.parameters).toEqual({
      planDepth: "detailed",
      focusArea: "cache invalidation",
    });
  });

  it("builds a selected-recipe kickoff message with an optional user note", () => {
    const recipe = {
      id: "explain-selected-work",
      title: "Explain simply",
      description: "Summarize the work in plain language.",
      prompt: "Explain the selected work simply.",
      workflow: {
        kind: "recipe" as const,
        recipeId: "explain-selected-work",
        title: "Explain simply",
        description: "Summarize the work in plain language.",
        source: "bundled" as const,
        surface: "workitem.detail.sidepanel" as const,
      },
    };

    expect(
      buildT3workSelectedRecipeKickoffMessage({
        selectedRecipe: { recipe },
      }),
    ).toBe("Explain the selected work simply.");

    expect(
      buildT3workSelectedRecipeKickoffMessage({
        selectedRecipe: { recipe },
        customMessage: "Focus on rollout risk.",
      }),
    ).toBe("Explain the selected work simply.\n\nAdditional user note:\nFocus on rollout risk.");
  });

  it("creates a guided recipe-authoring kickoff when no custom note is provided", () => {
    const bundledRecipe = getBundledT3WorkRecipe("create-contextual-recipe");
    if (!bundledRecipe?.kickoff) {
      throw new Error("Expected bundled recipe kickoff");
    }

    const recipe: T3workSidecarRecipeQuickStart = {
      id: bundledRecipe.id,
      title: "Create a recipe for this view",
      description: bundledRecipe.shortDescription,
      prompt: bundledRecipe.promptTemplate,
      actionView: {
        source: "export default function Action() { return null; }",
        context: {
          surface: "workitem.detail.sidepanel" as const,
          project: createProject(),
          workitem: {
            kind: "ticket",
            displayId: "IES-9242",
            title: "Stabilize search",
            type: "Bug",
            status: "In Progress",
            priority: "High",
          },
          linkedResources: createQueryable([]),
          artifacts: createQueryable([]),
          contextAttachments: createQueryable([
            {
              kind: "jira-work-item",
              label: "IES-9242 Stabilize search",
              summaryItems: [{ label: "Status", value: "In Progress" }],
            },
          ]),
          surfaceState: {
            hasContextAttachments: true,
            hasSelectedWork: true,
          },
          profile: {
            technicalDepth: "high",
            brevity: "balanced",
            guidanceStyle: "expert",
            detailDensity: "expert",
            preferredArtifactKinds: [],
            defaultActionFamilies: [],
            defaultRecipeWeights: {},
          },
          enabledSkillPacks: ["engineering"],
          schema: {},
          availableContextKeys: createQueryable([
            "project.summary",
            "ticket.summary",
            "ticket.context.blocked",
          ]),
        },
      },
      workflow: {
        kind: "recipe" as const,
        recipeId: bundledRecipe.id,
        kickoff: bundledRecipe.kickoff,
        title: "Create a recipe for this view",
        description: bundledRecipe.shortDescription,
        source: "bundled" as const,
        surface: "workitem.detail.sidepanel" as const,
      },
    };

    expect(
      buildT3workSelectedRecipeKickoffLaunch({
        selectedRecipe: { recipe },
      }),
    ).toMatchObject({
      kickoffPending: false,
    });

    expect(
      buildT3workSelectedRecipeKickoffLaunch({
        selectedRecipe: { recipe },
      }).kickoffMessage,
    ).toContain("Describe the recipe you want");
    expect(
      buildT3workSelectedRecipeKickoffLaunch({
        selectedRecipe: { recipe },
      }).kickoffMessage,
    ).toContain("A recipe is a reusable quick action for views like this.");
    expect(
      buildT3workSelectedRecipeKickoffLaunch({
        selectedRecipe: { recipe },
      }).kickoffMessage,
    ).toContain("What the agent can already see");
    expect(
      buildT3workSelectedRecipeKickoffLaunch({
        selectedRecipe: { recipe },
      }).kickoffMessage,
    ).toContain("Current focus: IES-9242 - Stabilize search");
    expect(
      buildT3workSelectedRecipeKickoffLaunch({
        selectedRecipe: { recipe },
      }).kickoffMessage,
    ).toContain("Signals this recipe can use");
    expect(
      buildT3workSelectedRecipeKickoffLaunch({
        selectedRecipe: { recipe },
      }).kickoffMessage,
    ).toContain("ticket.summary");
    expect(
      buildT3workSelectedRecipeKickoffLaunch({
        selectedRecipe: { recipe },
      }).kickoffMessage,
    ).toContain("What a recipe can do");
    expect(
      buildT3workSelectedRecipeKickoffLaunch({
        selectedRecipe: { recipe },
      }).kickoffMessage,
    ).toContain("Draft a handoff or validation checklist from the current ticket.");
  });

  it("still hands the recipe straight to the agent when a custom note exists", () => {
    const recipe = {
      id: "create-contextual-recipe",
      title: "Create a recipe for this view",
      description: "Design a contextual recipe for the current surface.",
      prompt: "Help me create a recipe for this context.",
      workflow: {
        kind: "recipe" as const,
        recipeId: "create-contextual-recipe",
        kickoff: {
          version: 1 as const,
          steps: [
            {
              kind: "collect-input" as const,
              id: "collect-recipe-brief",
              request: {
                kind: "text" as const,
                when: "missing-prompt" as const,
                promptRequest: {
                  title: "Recipe authoring kickoff",
                },
              },
            },
            {
              kind: "agent" as const,
              id: "author-recipe",
            },
          ],
        },
        title: "Create a recipe for this view",
        description: "Design a contextual recipe for the current surface.",
        source: "bundled" as const,
        surface: "project.dashboard.backlog" as const,
      },
    };

    expect(
      buildT3workSelectedRecipeKickoffLaunch({
        selectedRecipe: { recipe },
        customMessage: "I want a backlog recipe that only appears for risk hotspots.",
      }),
    ).toEqual({
      kickoffPending: true,
      kickoffMessage:
        "Help me create a recipe for this context.\n\nAdditional user note:\nI want a backlog recipe that only appears for risk hotspots.",
    });
  });

  it("describes selected launch options for composer summary UI", () => {
    expect(
      describeT3workSelectedRecipeQuickStart({
        recipe: {
          id: "review-acceptance-criteria",
          title: "Review acceptance criteria",
          description: "Call out ambiguity.",
          prompt: "Review acceptance criteria.",
          workflow: {
            kind: "recipe" as const,
            recipeId: "review-acceptance-criteria",
            title: "Review acceptance criteria",
            description: "Call out ambiguity.",
            source: "bundled" as const,
            surface: "workitem.detail.sidepanel" as const,
          },
        },
        customization: {
          selections: [
            {
              name: "acceptanceLens",
              label: "Review for",
              value: "qa",
              displayValue: "QA",
            },
            {
              name: "focusArea",
              label: "Extra focus",
              value: "retry behavior",
              displayValue: "retry behavior",
            },
          ],
        },
      }),
    ).toBe("Review for: QA • Extra focus: retry behavior");
  });

  it("returns recipe-specific composer guidance when present", () => {
    const selectedRecipe = {
      recipe: {
        id: "unblock-blocked-ticket",
        title: "Unblock IES-9242",
        description: "Pick the next move that will reopen progress.",
        composerGuidance: {
          helperText: "Add any context that could change the recommendation.",
          placeholder: "Add owner, attempts, deadline, or fallback",
        },
        prompt: "Unblock this work.",
        workflow: {
          kind: "recipe" as const,
          recipeId: "unblock-blocked-ticket",
          title: "Unblock IES-9242",
          description: "Pick the next move that will reopen progress.",
          source: "bundled" as const,
          surface: "workitem.detail.sidepanel" as const,
        },
      },
    };

    expect(getT3workSelectedRecipeComposerHelperText(selectedRecipe)).toBe(
      "Add any context that could change the recommendation.",
    );
    expect(getT3workSelectedRecipeComposerPlaceholder(selectedRecipe)).toBe(
      "Add owner, attempts, deadline, or fallback",
    );
  });

  it("falls back to the default composer guidance when a recipe does not provide one", () => {
    const selectedRecipe = {
      recipe: {
        id: "explain-selected-work",
        title: "Explain simply",
        description: "Summarize the work in plain language.",
        prompt: "Explain the selected work simply.",
        workflow: {
          kind: "recipe" as const,
          recipeId: "explain-selected-work",
          title: "Explain simply",
          description: "Summarize the work in plain language.",
          source: "bundled" as const,
          surface: "workitem.detail.sidepanel" as const,
        },
      },
    };

    expect(getT3workSelectedRecipeComposerHelperText(selectedRecipe)).toBe(
      DEFAULT_T3WORK_SELECTED_RECIPE_HELPER_TEXT,
    );
    expect(getT3workSelectedRecipeComposerPlaceholder(selectedRecipe)).toBe(
      DEFAULT_T3WORK_SELECTED_RECIPE_PLACEHOLDER,
    );
  });
});
