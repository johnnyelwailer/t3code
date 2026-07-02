import { describe, expect, it } from "vite-plus/test";

import {
  ALL_JIRA_FILTERS_ROUTE_SEARCH_VALUE,
  ALL_SPRINTS_ROUTE_SEARCH_VALUE,
  EMPTY_BOARD_ROUTE_SEARCH_VALUE,
  buildProjectDashboardBacklogRouteSearch,
  createDefaultProjectDashboardBacklogState,
  parseProjectDashboardBacklogRouteSearch,
  resolveProjectDashboardBacklogState,
  stripProjectDashboardBacklogSearchParams,
} from "./t3work-projectDashboardBacklogState";

describe("project dashboard backlog state", () => {
  it("lets query params override persisted state including explicit reset values", () => {
    const persisted = {
      query: "persisted query",
      focusFilter: "needs-plan",
      assigneeFilter: "account-1",
      visibleIssueTypes: ["standard", "subtask"],
      selectedLabels: ["backend"],
      selectedQuickFilterIds: ["qf-1"],
      viewMode: "table",
      tableGroupBy: "assignee",
      tableSortBy: "title",
      tableSortDirection: "asc",
      visibleTableColumns: ["status", "parent", "subtasks"],
      boardId: "board-2",
      sprintId: "sprint-9",
      filterId: "filter-4",
    } as const;

    const search = parseProjectDashboardBacklogRouteSearch({
      q: "",
      focus: "all",
      sprint: ALL_SPRINTS_ROUTE_SEARCH_VALUE,
      jiraFilter: ALL_JIRA_FILTERS_ROUTE_SEARCH_VALUE,
      board: "board-1",
      view: "planning",
    });

    expect(resolveProjectDashboardBacklogState({ persisted, search })).toEqual({
      query: "",
      focusFilter: "all",
      assigneeFilter: "account-1",
      assigneeFilterScope: { epic: false, story: true, subtask: false },
      visibleIssueTypes: ["standard", "subtask"],
      selectedLabels: ["backend"],
      selectedQuickFilterIds: ["qf-1"],
      viewMode: "planning",
      tableGroupBy: "assignee",
      tableSortBy: "title",
      tableSortDirection: "asc",
      visibleTableColumns: ["status", "parent", "subtasks"],
      boardId: "board-1",
      sprintId: undefined,
      filterId: undefined,
    });
  });

  it("builds deterministic route search values from the current backlog state", () => {
    expect(
      buildProjectDashboardBacklogRouteSearch({
        ...createDefaultProjectDashboardBacklogState(),
        query: "owner:alex",
        boardId: undefined,
        sprintId: undefined,
        filterId: "filter-7",
      }),
    ).toEqual({
      q: "owner:alex",
      focus: "all",
      assignee: "__all__",
      view: "table",
      group: "planning-state",
      sort: "rank",
      dir: "desc",
      board: EMPTY_BOARD_ROUTE_SEARCH_VALUE,
      sprint: ALL_SPRINTS_ROUTE_SEARCH_VALUE,
      jiraFilter: "filter-7",
    });
  });

  it("round-trips selected labels through route search and persisted state", () => {
    const search = parseProjectDashboardBacklogRouteSearch({ labels: "backend,urgent" });
    expect(search.labels).toBe("backend,urgent");

    const resolved = resolveProjectDashboardBacklogState({ search });
    expect(resolved.selectedLabels).toEqual(["backend", "urgent"]);

    expect(
      buildProjectDashboardBacklogRouteSearch({
        ...createDefaultProjectDashboardBacklogState(),
        selectedLabels: ["backend", "urgent"],
      }).labels,
    ).toBe("backend,urgent");

    expect(
      buildProjectDashboardBacklogRouteSearch(createDefaultProjectDashboardBacklogState()).labels,
    ).toBeUndefined();
  });

  it("clears selected labels when the route search explicitly resets them", () => {
    const search = parseProjectDashboardBacklogRouteSearch({ q: "" });
    expect(
      resolveProjectDashboardBacklogState({
        persisted: { selectedLabels: ["backend"] },
        search: { ...search, labels: "" },
      }).selectedLabels,
    ).toEqual([]);
  });

  it("round-trips selected quick filters through route search and persisted state", () => {
    const search = parseProjectDashboardBacklogRouteSearch({ quickFilters: "qf-1,qf-2" });
    expect(search.quickFilters).toBe("qf-1,qf-2");

    const resolved = resolveProjectDashboardBacklogState({ search });
    expect(resolved.selectedQuickFilterIds).toEqual(["qf-1", "qf-2"]);

    expect(
      buildProjectDashboardBacklogRouteSearch({
        ...createDefaultProjectDashboardBacklogState(),
        selectedQuickFilterIds: ["qf-1", "qf-2"],
      }).quickFilters,
    ).toBe("qf-1,qf-2");

    expect(
      buildProjectDashboardBacklogRouteSearch(createDefaultProjectDashboardBacklogState())
        .quickFilters,
    ).toBeUndefined();
  });

  it("clears selected quick filters when the route search explicitly resets them", () => {
    const search = parseProjectDashboardBacklogRouteSearch({ q: "" });
    expect(
      resolveProjectDashboardBacklogState({
        persisted: { selectedQuickFilterIds: ["qf-1"] },
        search: { ...search, quickFilters: "" },
      }).selectedQuickFilterIds,
    ).toEqual([]);
  });

  it("accepts planning-space as a routable backlog view mode", () => {
    const search = parseProjectDashboardBacklogRouteSearch({ view: "planning-space" });

    expect(search.view).toBe("planning-space");
    expect(
      resolveProjectDashboardBacklogState({
        persisted: { viewMode: "table" },
        search,
      }).viewMode,
    ).toBe("planning-space");
  });

  it("strips backlog query params while preserving unrelated search params", () => {
    expect(
      stripProjectDashboardBacklogSearchParams({
        q: "hello",
        focus: "all",
        board: "board-1",
        jiraFilter: "filter-3",
        unrelated: "keep-me",
      }),
    ).toEqual({ unrelated: "keep-me" });
  });

  it("normalizes persisted visible columns by keeping unique valid values", () => {
    expect(
      resolveProjectDashboardBacklogState({
        persisted: {
          visibleTableColumns: ["status", "unknown", "status"] as never,
        },
      }),
    ).toEqual({
      ...createDefaultProjectDashboardBacklogState(),
      visibleTableColumns: ["status"],
    });
  });
});
