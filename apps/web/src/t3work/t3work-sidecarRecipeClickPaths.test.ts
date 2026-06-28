import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";

import { buildProjectDashboardSelectedRecipe } from "~/t3work/t3work-dashboardRecipeSelection";
import { resolveT3workDashboardRecipeAction } from "~/t3work/t3work-dashboardRecipeActions";
import { buildT3workSidecarRecipeQuickStarts } from "~/t3work/t3work-sidecarRecipes";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

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

function createProject(profileId: string): ProjectShellProject {
  return {
    id: "project-alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      externalProjectId: "PA",
      raw: { agentSetup: { profileId } },
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

describe("KEEP recipe click paths", () => {
  it("maps show-only-assigned-to-me to a dashboard filter action, not chat staging", () => {
    expect(resolveT3workDashboardRecipeAction("show-only-assigned-to-me")).toEqual({
      kind: "show-only-assigned-to-me",
    });

    const selected = buildProjectDashboardSelectedRecipe({
      recipe: createQuickStart({
        id: "show-only-assigned-to-me",
        title: "Show only assigned to me",
        description: "Apply assignee filter.",
        prompt: "Filter to me.",
      }),
    });

    expect(selected.recipe.id).toBe("show-only-assigned-to-me");
  });

  it("maps clear-filters to a dashboard filter action", () => {
    expect(resolveT3workDashboardRecipeAction("clear-filters")).toEqual({
      kind: "clear-filters",
    });
  });

  it("stages explain-selected-work for chat kickoff", () => {
    const selected = buildProjectDashboardSelectedRecipe({
      recipe: createQuickStart(),
    });

    expect(selected.recipe.id).toBe("explain-selected-work");
    expect(selected.recipe.prompt).toBe("Explain this simply.");
  });

  it("stages focus-needs-my-action rank-next without treating it as a plain filter action", () => {
    const dashboardAction = resolveT3workDashboardRecipeAction("focus-needs-my-action");
    expect(dashboardAction).toEqual({ kind: "focus-needs-my-action" });

    const selected = buildProjectDashboardSelectedRecipe({
      recipe: createQuickStart({
        id: "focus-needs-my-action",
        title: "Show what needs my action",
        description: "Filter then rank.",
        prompt: "Rank what needs my action next.",
      }),
    });

    expect(selected.recipe.id).toBe("focus-needs-my-action");
    expect(selected.recipe.prompt).toBe("Rank what needs my action next.");
  });

  it("stages ticket refinement and QA recipes for chat kickoff", () => {
    for (const recipeId of [
      "review-acceptance-criteria",
      "tshirt-size-epic",
      "shape-next-backlog-slice",
    ] as const) {
      const selected = buildProjectDashboardSelectedRecipe({
        recipe: createQuickStart({ id: recipeId, prompt: `${recipeId} prompt` }),
      });
      expect(selected.recipe.id).toBe(recipeId);
      expect(resolveT3workDashboardRecipeAction(recipeId)).toBeUndefined();
    }
  });

  it("hides clear-filters until dashboard.view.filtered is available", () => {
    const withoutFilters = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("delivery-coordinator"),
      profileId: "delivery-coordinator",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: { itemCount: 6, bugCount: 1 },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });
    const withFilters = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("delivery-coordinator"),
      profileId: "delivery-coordinator",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: { itemCount: 6, bugCount: 1, viewFiltersActive: true },
      availableContextKeys: [
        "project.summary",
        "dashboard.backlog.summary",
        "dashboard.view.filtered",
      ],
    });

    expect(withoutFilters.map((recipe) => recipe.id)).not.toContain("clear-filters");
    expect(withFilters.map((recipe) => recipe.id)).toContain("clear-filters");
  });

  it("gates PACK engineering recipe behind engineering skill pack", () => {
    const withoutEngineering = buildT3workSidecarRecipeQuickStarts({
      surface: "workitem.detail.sidepanel",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "PROJ-1",
      resourceKind: "ticket",
      jiraIssueType: "Task",
      ticketContext: {
        status: "Selected for Development",
        relationships: {
          childKeys: [],
          referenceKeys: [],
          blockedByKeys: [],
          blockingKeys: [],
        },
        github: {
          pullRequestCount: 0,
          openPullRequestCount: 0,
          draftPullRequestCount: 0,
          mergedPullRequestCount: 0,
          closedPullRequestCount: 0,
          reviewRequestedPullRequestCount: 0,
          commentCount: 0,
          reviewCommentCount: 0,
        },
      },
      availableContextKeys: ["project.summary", "ticket.summary", "ticket.context.pre-implementation"],
    });
    const withEngineering = buildT3workSidecarRecipeQuickStarts({
      surface: "workitem.detail.sidepanel",
      project: createProject("engineering-copilot"),
      profileId: "engineering-copilot",
      selectedWorkLabel: "PROJ-1",
      resourceKind: "ticket",
      jiraIssueType: "Task",
      ticketContext: {
        status: "Selected for Development",
        relationships: {
          childKeys: [],
          referenceKeys: [],
          blockedByKeys: [],
          blockingKeys: [],
        },
        github: {
          pullRequestCount: 0,
          openPullRequestCount: 0,
          draftPullRequestCount: 0,
          mergedPullRequestCount: 0,
          closedPullRequestCount: 0,
          reviewRequestedPullRequestCount: 0,
          commentCount: 0,
          reviewCommentCount: 0,
        },
      },
      availableContextKeys: ["project.summary", "ticket.summary", "ticket.context.pre-implementation"],
    });

    expect(withoutEngineering.some((recipe) => recipe.id === "technical-implementation-plan")).toBe(
      false,
    );
    expect(withEngineering.some((recipe) => recipe.id === "technical-implementation-plan")).toBe(
      true,
    );
  });

  it("gates PACK qa test plan behind qa skill pack", () => {
    const deliveryOnly = buildT3workSidecarRecipeQuickStarts({
      surface: "workitem.detail.sidepanel",
      project: createProject("delivery-coordinator"),
      profileId: "delivery-coordinator",
      selectedWorkLabel: "PROJ-1",
      resourceKind: "ticket",
      jiraIssueType: "Task",
      ticketContext: {
        status: "Selected for Development",
        relationships: {
          childKeys: [],
          referenceKeys: [],
          blockedByKeys: [],
          blockingKeys: [],
        },
        github: {
          pullRequestCount: 0,
          openPullRequestCount: 0,
          draftPullRequestCount: 0,
          mergedPullRequestCount: 0,
          closedPullRequestCount: 0,
          reviewRequestedPullRequestCount: 0,
          commentCount: 0,
          reviewCommentCount: 0,
        },
      },
      availableContextKeys: ["project.summary", "ticket.summary", "ticket.context.pre-implementation"],
    });
    const qaProfile = buildT3workSidecarRecipeQuickStarts({
      surface: "workitem.detail.sidepanel",
      project: createProject("qa-assistant"),
      profileId: "qa-assistant",
      selectedWorkLabel: "PROJ-1",
      resourceKind: "ticket",
      jiraIssueType: "Task",
      ticketContext: {
        status: "Selected for Development",
        relationships: {
          childKeys: [],
          referenceKeys: [],
          blockedByKeys: [],
          blockingKeys: [],
        },
        github: {
          pullRequestCount: 0,
          openPullRequestCount: 0,
          draftPullRequestCount: 0,
          mergedPullRequestCount: 0,
          closedPullRequestCount: 0,
          reviewRequestedPullRequestCount: 0,
          commentCount: 0,
          reviewCommentCount: 0,
        },
      },
      availableContextKeys: ["project.summary", "ticket.summary", "ticket.context.pre-implementation"],
    });

    expect(deliveryOnly.some((recipe) => recipe.id === "create-qa-test-plan")).toBe(false);
    expect(qaProfile.some((recipe) => recipe.id === "create-qa-test-plan")).toBe(true);
  });
});
