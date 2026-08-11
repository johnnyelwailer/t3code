import { describe, expect, it } from "vite-plus/test";

import {
  resolveProjectDashboardMyWorkState,
  type PersistedProjectDashboardMyWorkState,
  type ProjectDashboardMyWorkRouteSearch,
} from "~/t3team/t3team-projectDashboardMyWorkState";

describe("project dashboard my work state", () => {
  it("defaults to kanban view with no hidden lanes", () => {
    expect(resolveProjectDashboardMyWorkState({})).toEqual({
      query: "",
      viewMode: "kanban",
      groupMode: "hierarchy",
      statusCategory: "all",
      hiddenKanbanColumnIds: [],
      hasCustomizedKanbanLanes: false,
      excludedTypeKeys: [],
      selectedPriority: "all",
      selectedStatus: "all",
      tableSortBy: "updated",
      tableSortDirection: "desc",
    });
  });

  it("merges persisted state with route search overrides", () => {
    const persisted: PersistedProjectDashboardMyWorkState = {
      query: "persisted query",
      viewMode: "grid",
      groupMode: "flat",
      statusCategory: "review",
      hiddenKanbanColumnIds: ["accepted"],
      hasCustomizedKanbanLanes: true,
      excludedTypeKeys: ["bug"],
      selectedPriority: "High",
      selectedStatus: "In Review",
      tableSortBy: "status",
      tableSortDirection: "asc",
    };
    const search: ProjectDashboardMyWorkRouteSearch = {
      myWorkQ: "route query",
      myWorkView: "table",
      myWorkGroup: "hierarchy",
      myWorkStatus: "active",
      myWorkLanesMode: "custom",
      myWorkLanes: "in-test,accepted",
      myWorkPriority: "Critical",
      myWorkTicketStatus: "In Progress",
      myWorkTypes: "epic,story",
      myWorkSort: "updated",
      myWorkDir: "desc",
    };

    expect(resolveProjectDashboardMyWorkState({ persisted, search })).toEqual({
      query: "route query",
      viewMode: "table",
      groupMode: "hierarchy",
      statusCategory: "active",
      hiddenKanbanColumnIds: ["accepted", "in-test"],
      hasCustomizedKanbanLanes: true,
      excludedTypeKeys: ["epic", "story"],
      selectedPriority: "Critical",
      selectedStatus: "In Progress",
      tableSortBy: "updated",
      tableSortDirection: "desc",
    });
  });

  it("treats legacy lane-only route state as a custom lane selection", () => {
    expect(resolveProjectDashboardMyWorkState({ search: { myWorkLanes: "done" } })).toEqual({
      query: "",
      viewMode: "kanban",
      groupMode: "hierarchy",
      statusCategory: "all",
      hiddenKanbanColumnIds: ["done"],
      hasCustomizedKanbanLanes: true,
      excludedTypeKeys: [],
      selectedPriority: "all",
      selectedStatus: "all",
      tableSortBy: "updated",
      tableSortDirection: "desc",
    });
  });

  it("ignores a stale myWorkGitHub param arriving from an old bookmarked URL", () => {
    expect(
      resolveProjectDashboardMyWorkState({
        search: { myWorkQ: "q", myWorkGitHub: "show" } as ProjectDashboardMyWorkRouteSearch,
      }),
    ).toEqual({
      query: "q",
      viewMode: "kanban",
      groupMode: "hierarchy",
      statusCategory: "all",
      hiddenKanbanColumnIds: [],
      hasCustomizedKanbanLanes: false,
      excludedTypeKeys: [],
      selectedPriority: "all",
      selectedStatus: "all",
      tableSortBy: "updated",
      tableSortDirection: "desc",
    });
  });
});
