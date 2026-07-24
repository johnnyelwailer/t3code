import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "~/t3team/t3team-projectBacklogTestUtils";

import {
  buildProjectMyWorkStatusOptions,
  hasProjectMyWorkDisplayNameDependentAssignments,
  resolveProjectMyWorkHiddenKanbanColumnIds,
  shouldShowProjectMyWorkLoadingState,
} from "./t3team-projectMyWorkStateHelpers";

describe("project my work state helpers", () => {
  it("prefers Jira-backed available statuses for exact status filters", () => {
    const tickets = [createTicket({ id: "todo", status: "To Do" })];

    expect(
      buildProjectMyWorkStatusOptions(
        [{ name: "Code Review" }, { name: "Done" }, { name: "To Do" }],
        tickets,
      ),
    ).toEqual(["Code Review", "Done", "To Do"]);
  });

  it("falls back to assigned ticket statuses when Jira statuses are unavailable", () => {
    const tickets = [
      createTicket({ id: "done", status: "Done" }),
      createTicket({ id: "review", status: "Code Review" }),
    ];

    expect(buildProjectMyWorkStatusOptions([], tickets)).toEqual(["Code Review", "Done"]);
  });

  it("auto-hides empty status lanes until the user customizes them", () => {
    expect(
      resolveProjectMyWorkHiddenKanbanColumnIds({
        hiddenKanbanColumnIds: [],
        hasCustomizedKanbanLanes: false,
        kanbanLaneOptions: [
          { id: "todo", title: "To Do", count: 3 },
          { id: "review", title: "Code Review", count: 0 },
          { id: "done", title: "Done", count: 1 },
        ],
      }),
    ).toEqual(["review"]);
  });

  it("keeps custom lane visibility instead of reapplying the auto defaults", () => {
    expect(
      resolveProjectMyWorkHiddenKanbanColumnIds({
        hiddenKanbanColumnIds: ["done"],
        hasCustomizedKanbanLanes: true,
        kanbanLaneOptions: [
          { id: "todo", title: "To Do", count: 3 },
          { id: "review", title: "Code Review", count: 0 },
          { id: "done", title: "Done", count: 1 },
        ],
      }),
    ).toEqual(["done"]);
  });

  it("keeps all lanes visible by default when every lane is empty", () => {
    expect(
      resolveProjectMyWorkHiddenKanbanColumnIds({
        hiddenKanbanColumnIds: [],
        hasCustomizedKanbanLanes: false,
        kanbanLaneOptions: [
          { id: "todo", title: "To Do", count: 0 },
          { id: "review", title: "Code Review", count: 0 },
        ],
      }),
    ).toEqual([]);
  });

  it("treats name-based assignments with missing or different account ids as display-name dependent", () => {
    expect(
      hasProjectMyWorkDisplayNameDependentAssignments(
        [
          createTicket({ id: "name-only", assignee: "Philip Jonientz" }),
          createTicket({
            id: "different-account",
            assignee: "Philip Jonientz",
            assigneeAccountId: "account-other",
          }),
          createTicket({
            id: "same-account",
            assignee: "Philip Jonientz",
            assigneeAccountId: "account-pj",
          }),
        ],
        "account-pj",
      ),
    ).toBe(true);
  });

  it("keeps my work loading while display-name dependent assignments could still resolve", () => {
    expect(
      shouldShowProjectMyWorkLoadingState({
        resourcesLoading: false,
        ticketCount: 2,
        currentUserDisplayNameLoading: true,
        hasDisplayNameDependentAssignments: true,
        assignedWorkItemsCount: 0,
      }),
    ).toBe(true);

    expect(
      shouldShowProjectMyWorkLoadingState({
        resourcesLoading: false,
        ticketCount: 2,
        currentUserDisplayNameLoading: true,
        hasDisplayNameDependentAssignments: false,
        assignedWorkItemsCount: 0,
      }),
    ).toBe(false);
  });
});
