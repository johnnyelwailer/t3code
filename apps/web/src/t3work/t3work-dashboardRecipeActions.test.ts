import { describe, expect, it } from "vite-plus/test";

import {
  buildBacklogAssignedToMeOutcome,
  buildBacklogNeedsMyActionOutcome,
  buildMyWorkNeedsMyActionOutcome,
  resolveT3workDashboardRecipeAction,
} from "~/t3work/t3work-dashboardRecipeActions";
import {
  buildBacklogClearFiltersOutcome,
  buildMyWorkClearFiltersOutcome,
} from "~/t3work/t3work-dashboardRecipeFilterOutcomes";
import {
  createDefaultProjectDashboardBacklogState,
  type ProjectDashboardBacklogState,
} from "~/t3work/t3work-projectDashboardBacklogStateShared";
import {
  createDefaultProjectDashboardMyWorkState,
  type ProjectDashboardMyWorkState,
} from "~/t3work/t3work-projectDashboardMyWorkState";
import type { ProjectTicket } from "~/t3work/t3work-types";

function createTicket(overrides: Partial<ProjectTicket> = {}): ProjectTicket {
  const { ref: refOverrides, ...ticketOverrides } = overrides;

  return {
    id: overrides.id ?? "ticket-1",
    projectId: overrides.projectId ?? "project-1",
    ref: {
      provider: "atlassian",
      kind: "jira.issue",
      id: refOverrides?.id ?? overrides.id ?? "ticket-1",
      displayId: refOverrides?.displayId ?? "PROJ-1",
      title: refOverrides?.title ?? "Example ticket",
      ...(typeof refOverrides?.type === "string" ? { type: refOverrides.type } : {}),
      ...(typeof refOverrides?.issueTypeIconUrl === "string"
        ? { issueTypeIconUrl: refOverrides.issueTypeIconUrl }
        : {}),
      url: refOverrides?.url ?? "https://example.com/browse/PROJ-1",
      projectId: refOverrides?.projectId ?? overrides.projectId ?? "project-1",
    },
    status: overrides.status ?? "To Do",
    updatedAt: overrides.updatedAt ?? "2026-05-01T00:00:00.000Z",
    ...ticketOverrides,
  };
}

describe("t3work-dashboardRecipeActions", () => {
  it("maps dashboard inline-action recipe ids to dashboard actions", () => {
    expect(resolveT3workDashboardRecipeAction("focus-needs-my-action")).toEqual({
      kind: "focus-needs-my-action",
    });
    expect(resolveT3workDashboardRecipeAction("show-only-assigned-to-me")).toEqual({
      kind: "show-only-assigned-to-me",
    });
    expect(resolveT3workDashboardRecipeAction("clear-filters")).toEqual({
      kind: "clear-filters",
    });
    expect(resolveT3workDashboardRecipeAction("prioritize-pending-work")).toBeUndefined();
  });

  it("updates the backlog assignee filter to the current user", () => {
    const outcome = buildBacklogAssignedToMeOutcome(
      createDefaultProjectDashboardBacklogState(),
      "Pat Jones",
    );

    expect(outcome).toEqual({
      nextState: expect.objectContaining({ assigneeFilter: "Pat Jones" }),
      promptText: "The dashboard is now filtered to work assigned to Pat Jones.",
    });
  });

  it("filters backlog to needs-plan work before other presets", () => {
    const state: ProjectDashboardBacklogState = {
      ...createDefaultProjectDashboardBacklogState(),
      query: "search",
      assigneeFilter: "account:pj",
    };
    const outcome = buildBacklogNeedsMyActionOutcome(state, [
      createTicket({
        id: "ticket-1",
        assignee: "PJ",
        assigneeAccountId: "pj",
      }),
      createTicket({
        id: "ticket-2",
        assignee: "Taylor",
        assigneeAccountId: "taylor",
        estimateValue: 3,
      }),
    ]);

    expect(outcome).toMatchObject({
      nextState: {
        focusFilter: "needs-plan",
        query: "search",
        assigneeFilter: "account:pj",
      },
    });
    expect(outcome?.promptText).toContain("need planning");
  });

  it("falls back to unassigned backlog work when planning data is already complete", () => {
    const outcome = buildBacklogNeedsMyActionOutcome(createDefaultProjectDashboardBacklogState(), [
      createTicket({
        id: "ticket-1",
        estimateValue: 3,
      }),
      createTicket({
        id: "ticket-2",
        assignee: "Taylor",
        assigneeAccountId: "taylor",
        estimateValue: 5,
      }),
    ]);

    expect(outcome?.nextState.focusFilter).toBe("unassigned");
    expect(outcome?.promptText).toContain("need an assignee");
  });

  it("filters my work to review items when review work exists", () => {
    const state: ProjectDashboardMyWorkState = {
      ...createDefaultProjectDashboardMyWorkState(),
      query: "stale",
      selectedPriority: "High",
      selectedStatus: "In Review",
      showGitHubActivity: false,
    };
    const outcome = buildMyWorkNeedsMyActionOutcome(state, [
      createTicket({ id: "ticket-1", status: "In Review" }),
      createTicket({ id: "ticket-2", status: "In Progress" }),
    ]);

    expect(outcome).toMatchObject({
      nextState: {
        statusCategory: "review",
        query: "stale",
        selectedPriority: "High",
        selectedStatus: "In Review",
        showGitHubActivity: false,
      },
    });
    expect(outcome?.promptText).toContain("review-stage work");
  });

  it("falls back to active my work when nothing is waiting in review", () => {
    const outcome = buildMyWorkNeedsMyActionOutcome(createDefaultProjectDashboardMyWorkState(), [
      createTicket({ id: "ticket-1", status: "Selected for Development" }),
      createTicket({ id: "ticket-2", status: "In Progress" }),
    ]);

    expect(outcome?.nextState.statusCategory).toBe("active");
    expect(outcome?.promptText).toContain("active work");
  });

  it("clears backlog view filters back to defaults", () => {
    const outcome = buildBacklogClearFiltersOutcome({
      ...createDefaultProjectDashboardBacklogState(),
      focusFilter: "needs-plan",
      assigneeFilter: "Pat Jones",
      query: "blocked",
    });

    expect(outcome.nextState).toMatchObject({
      focusFilter: "all",
      assigneeFilter: "__all__",
      query: "",
    });
    expect(outcome.promptText).toContain("Cleared");
  });

  it("clears my-work view filters back to defaults", () => {
    const outcome = buildMyWorkClearFiltersOutcome({
      ...createDefaultProjectDashboardMyWorkState(),
      query: "review",
      statusCategory: "review",
      selectedPriority: "High",
    });

    expect(outcome.nextState).toMatchObject({
      query: "",
      statusCategory: "all",
      selectedPriority: "all",
    });
    expect(outcome.promptText).toContain("Cleared");
  });
});
