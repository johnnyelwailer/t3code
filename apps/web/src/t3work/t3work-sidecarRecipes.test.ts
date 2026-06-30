import { describe, expect, it } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";
import { queryableToReadonlyArray } from "@t3tools/project-context";

import {
  buildProjectRecipeDiscoveryRequest,
  buildT3workSidecarRecipeQuickStarts,
} from "~/t3work/t3work-sidecarRecipes";

function createProject(profileId: string, workspaceRoot?: string): ProjectShellProject {
  return {
    id: "project-alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      externalProjectId: "PA",
      raw: {
        agentSetup: {
          profileId,
        },
      },
    },
    ...(workspaceRoot
      ? {
          workspace: {
            rootPath: workspaceRoot,
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        }
      : {}),
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

describe("buildT3workSidecarRecipeQuickStarts", () => {
  it("surfaces review-acceptance-criteria for engineering-biased ticket detail", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "workitem.detail.sidepanel",
      project: createProject("engineering-copilot"),
      profileId: "engineering-copilot",
      selectedWorkLabel: "PROJ-123",
      resourceKind: "ticket",
      jiraIssueType: "Task",
      ticketContext: {
        status: "Selected for Development",
        assigneeRelation: "me",
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
      availableContextKeys: [
        "project.summary",
        "ticket.summary",
        "ticket.context.pre-implementation",
      ],
    });

    expect(quickStarts.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining([
        "review-acceptance-criteria",
        "technical-implementation-plan",
        "explain-selected-work",
      ]),
    );
    expect(quickStarts.some((recipe) => recipe.id === "review-acceptance-criteria")).toBe(true);
  });

  it("shows dashboard recipes without attached items while hiding selected-work recipes", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 8,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
      availableContextKeys: ["project.summary"],
    });

    expect(quickStarts.map((recipe) => recipe.id)).toContain("create-contextual-recipe");
    expect(quickStarts.some((recipe) => recipe.id === "explain-selected-work")).toBe(false);
  });

  it("surfaces backlog-only assignee filter on the backlog dashboard", () => {
    const backlogQuickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("delivery-coordinator"),
      profileId: "delivery-coordinator",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 6,
        bugCount: 2,
        primaryBugLabel: "IES-1200",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });
    const myWorkQuickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("delivery-coordinator"),
      profileId: "delivery-coordinator",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "my-work",
      currentViewSummary: {
        itemCount: 5,
        bugCount: 1,
        primaryBugLabel: "IES-1201",
      },
      availableContextKeys: ["project.summary", "dashboard.my-work.summary"],
    });

    expect(backlogQuickStarts.map((recipe) => recipe.id)).toContain("show-only-assigned-to-me");
    expect(myWorkQuickStarts.map((recipe) => recipe.id)).not.toContain("show-only-assigned-to-me");
  });

  it("renders bundled dashboard recipe titles from the current view context", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "my-work",
      currentViewSummary: {
        itemCount: 3,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
      availableContextKeys: ["project.summary"],
    });

    expect(quickStarts.find((recipe) => recipe.id === "create-contextual-recipe")).toMatchObject({
      title: "Create a recipe for this view",
    });
  });

  it("renders the recipe-authoring quick start against selected ticket context", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "workitem.detail.sidepanel",
      project: createProject("engineering-copilot"),
      profileId: "engineering-copilot",
      selectedWorkLabel: "PROJ-123",
      selectedWorkTitle: "Stabilize search",
      resourceKind: "ticket",
      jiraIssueType: "Bug",
      availableContextKeys: ["project.summary", "ticket.summary"],
    });

    expect(quickStarts.find((recipe) => recipe.id === "create-contextual-recipe")).toMatchObject({
      title: "Create a recipe for this view",
    });
  });

  it("does not attach workflow launch metadata to prompt-only bundled recipes", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "workitem.detail.sidepanel",
      project: createProject("product-partner", "/tmp/project-alpha"),
      profileId: "product-partner",
      selectedWorkLabel: "PROJ-100",
      selectedWorkTitle: "Platform epic",
      resourceKind: "ticket",
      jiraIssueType: "Epic",
      ticketContext: {
        relationships: {
          childKeys: [],
          referenceKeys: [],
          blockedByKeys: [],
          blockingKeys: [],
        },
      },
      availableContextKeys: ["project.summary", "ticket.summary"],
    });

    const recipe = quickStarts.find((quickStart) => quickStart.id === "explain-selected-work");
    expect(recipe).toBeDefined();
    expect(recipe?.workflow).toBeUndefined();
  });

  it("hides broad-dashboard focus recipe for very large unfocused views", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("delivery-coordinator"),
      profileId: "delivery-coordinator",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 100,
        bugCount: 13,
        primaryBugLabel: "IES-18659",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });

    const recipeIds = quickStarts.map((recipe) => recipe.id);
    expect(recipeIds).not.toContain("focus-needs-my-action");
    expect(recipeIds).toContain("show-only-assigned-to-me");
  });

  it("attaches bundled action views with rendered placeholders and recipe context", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("delivery-coordinator"),
      profileId: "delivery-coordinator",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 4,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });

    expect(quickStarts.find((recipe) => recipe.id === "show-only-assigned-to-me")).toMatchObject({
      actionView: {
        context: {
          project: { title: "Project Alpha" },
          surfaceState: {
            dashboardMode: "backlog",
            currentView: {
              itemCount: 4,
              bugCount: 1,
              primaryBugLabel: "IES-1234",
            },
          },
        },
      },
    });
    expect(
      quickStarts.find((recipe) => recipe.id === "show-only-assigned-to-me")?.actionView?.source,
    ).toContain('title="Show only assigned to me"');
  });

  it("does not synthesize a dashboard workitem without explicit selection context", () => {
    const request = buildProjectRecipeDiscoveryRequest({
      workspaceRoot: "/tmp/project-alpha",
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      availableContextKeys: ["project.summary"],
    });

    expect(request.context.workitem).toBeUndefined();
    expect(request.context.surfaceState).toMatchObject({
      dashboardMode: "backlog",
      hasContextAttachments: false,
      hasSelectedWork: false,
    });
  });

  it("passes attached work-item context into dashboard recipe discovery", () => {
    const request = buildProjectRecipeDiscoveryRequest({
      workspaceRoot: "/tmp/project-alpha",
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "PROJ-123 Stabilize search",
      dashboardMode: "backlog",
      resourceKind: "ticket",
      jiraIssueType: "Bug",
      contextAttachments: [
        {
          id: "att-1",
          kind: "jira-work-item",
          label: "PROJ-123 Stabilize search",
          jiraIssueType: "Bug",
          contextText: "context",
          summaryItems: [{ label: "Status", value: "In Progress" }],
        },
      ],
      availableContextKeys: ["project.summary", "selected-work.summary", "ticket.summary"],
    });

    expect(request.context.workitem).toMatchObject({
      kind: "ticket",
      displayId: "PROJ-123 Stabilize search",
      type: "Bug",
    });
    expect(queryableToReadonlyArray(request.context.contextAttachments)).toEqual([
      {
        kind: "jira-work-item",
        label: "PROJ-123 Stabilize search",
        jiraIssueType: "Bug",
        summaryItems: [{ label: "Status", value: "In Progress" }],
      },
    ]);
    expect(request.context.surfaceState).toMatchObject({
      dashboardMode: "backlog",
      hasContextAttachments: true,
      hasSelectedWork: true,
    });
  });

  it("passes current view summary into dashboard recipe discovery", () => {
    const request = buildProjectRecipeDiscoveryRequest({
      workspaceRoot: "/tmp/project-alpha",
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "Project Alpha",
      dashboardMode: "backlog",
      currentViewSummary: {
        itemCount: 3,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
      availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
    });

    expect(request.context.surfaceState).toMatchObject({
      dashboardMode: "backlog",
      hasContextAttachments: false,
      hasSelectedWork: false,
      currentView: {
        itemCount: 3,
        bugCount: 1,
        primaryBugLabel: "IES-1234",
      },
    });
  });

  it("passes structured ticket detail signals into recipe discovery", () => {
    const request = buildProjectRecipeDiscoveryRequest({
      workspaceRoot: "/tmp/project-alpha",
      surface: "workitem.detail.sidepanel",
      project: createProject("engineering-copilot"),
      profileId: "engineering-copilot",
      selectedWorkLabel: "IES-9242",
      selectedWorkTitle: "Stabilize search",
      resourceKind: "ticket",
      jiraIssueType: "Bug",
      workitemPriority: "High",
      ticketContext: {
        status: "In Progress",
        assignee: "PJ",
        assigneeRelation: "me",
        originalEstimateHours: 6,
        remainingEstimateHours: 10,
        relationships: {
          parentKey: "IES-9000",
          childKeys: ["IES-9243"],
          referenceKeys: ["IES-9100"],
          blockedByKeys: ["IES-9100"],
          blockingKeys: [],
        },
        github: {
          pullRequestCount: 1,
          openPullRequestCount: 1,
          draftPullRequestCount: 0,
          mergedPullRequestCount: 0,
          closedPullRequestCount: 0,
          reviewRequestedPullRequestCount: 1,
          commentCount: 2,
          reviewCommentCount: 3,
        },
      },
      linkedResources: [
        {
          kind: "github.pull-request",
          id: "pr-1",
          provider: "github",
          title: "Fix IES-9242",
          url: "https://github.com/acme/repo/pull/1",
          raw: {
            state: "open",
            reviewRequested: true,
            commentCount: 2,
            reviewCommentCount: 3,
          },
        },
      ],
      availableContextKeys: ["project.summary", "ticket.summary"],
    });

    expect(request.context.workitem).toMatchObject({
      kind: "ticket",
      displayId: "IES-9242",
      title: "Stabilize search",
      type: "Bug",
      priority: "High",
      status: "In Progress",
      assignee: "PJ",
      assigneeRelation: "me",
      originalEstimateHours: 6,
      remainingEstimateHours: 10,
    });
    expect(queryableToReadonlyArray(request.context.linkedResources)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "github.pull-request",
          id: "pr-1",
          provider: "github",
        }),
      ]),
    );
    expect(queryableToReadonlyArray(request.context.availableContextKeys)).toEqual(
      expect.arrayContaining([
        "ticket.status.in-progress",
        "ticket.assignment.me",
        "ticket.context.customer-risk",
        "ticket.context.blocked",
        "ticket.context.review-needs-response",
        "ticket.context.overrun",
      ]),
    );
  });

  it("surfaces selected-work recipes on the dashboard when ticket context exists", () => {
    const quickStarts = buildT3workSidecarRecipeQuickStarts({
      surface: "project.dashboard",
      project: createProject("product-partner"),
      profileId: "product-partner",
      selectedWorkLabel: "PROJ-123 Stabilize search",
      dashboardMode: "backlog",
      resourceKind: "ticket",
      jiraIssueType: "Bug",
      availableContextKeys: ["project.summary", "selected-work.summary", "ticket.summary"],
    });

    expect(quickStarts.find((recipe) => recipe.id === "explain-selected-work")).toMatchObject({
      title: "Explain this simply",
    });
  });
});
