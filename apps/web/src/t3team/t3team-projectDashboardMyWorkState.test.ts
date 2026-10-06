import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectDashboardMyWorkRouteSearch,
  parseProjectDashboardMyWorkRouteSearch,
  resolveProjectDashboardMyWorkState,
  type PersistedProjectDashboardMyWorkState,
  type ProjectDashboardMyWorkRouteSearch,
} from "~/t3team/t3team-projectDashboardMyWorkState";

describe("project dashboard my work state", () => {
  it("defaults to kanban view with no hidden lanes", () => {
    expect(resolveProjectDashboardMyWorkState({})).toEqual({
      query: "",
      lens: "digest",
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
      // A fully mirrored (pre-myWorkLens) route says nothing about the lens: default stays.
      lens: "digest",
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
      lens: "digest",
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
      lens: "digest",
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

  // Intentional change: the lens used to live only in local storage, so a link carrying
  // `myWorkView`/`myWorkGroup` was ignored under a persisted digest. The URL now wins.
  it("lets the route's myWorkLens override a persisted lens", () => {
    expect(
      resolveProjectDashboardMyWorkState({
        persisted: { lens: "board" },
        search: { myWorkLens: "digest", myWorkView: "table" },
      }),
    ).toMatchObject({ lens: "digest", viewMode: "table" });
  });

  it("maps a view-only link to the lens that renders it, over a persisted digest", () => {
    expect(
      resolveProjectDashboardMyWorkState({
        persisted: { lens: "digest" },
        search: { myWorkView: "kanban", myWorkGroup: "hierarchy" },
      }),
    ).toMatchObject({ lens: "board", viewMode: "kanban", groupMode: "hierarchy" });
    expect(
      resolveProjectDashboardMyWorkState({
        persisted: { lens: "digest" },
        search: { myWorkView: "table" },
      }),
    ).toMatchObject({ lens: "hierarchy", viewMode: "table" });
  });

  it("keeps a saved digest for an old URL that mirrored the whole default state", () => {
    // Builds before myWorkLens wrote `myWorkView=kanban&myWorkGroup=hierarchy` (the defaults)
    // plus the sort keys into every URL; reading that as a board request would lose the digest.
    expect(
      resolveProjectDashboardMyWorkState({
        persisted: { lens: "digest" },
        search: {
          myWorkQ: "",
          myWorkView: "kanban",
          myWorkGroup: "hierarchy",
          myWorkStatus: "all",
          myWorkSort: "updated",
          myWorkDir: "desc",
        },
      }),
    ).toMatchObject({ lens: "digest", viewMode: "kanban" });
  });

  it("keeps the persisted lens when the URL says nothing about the view", () => {
    expect(
      resolveProjectDashboardMyWorkState({
        persisted: { lens: "board" },
        search: { myWorkQ: "q" },
      }),
    ).toMatchObject({ lens: "board", query: "q" });
  });

  it("writes the lens to the URL and reads it back unchanged", () => {
    const state = resolveProjectDashboardMyWorkState({ persisted: { lens: "board" } });
    const search = buildProjectDashboardMyWorkRouteSearch(state);
    expect(search.myWorkLens).toBe("board");
    const reparsed = parseProjectDashboardMyWorkRouteSearch(
      search as unknown as Record<string, unknown>,
    );
    expect(
      resolveProjectDashboardMyWorkState({ persisted: { lens: "digest" }, search: reparsed }),
    ).toMatchObject({ lens: "board" });
    expect(parseProjectDashboardMyWorkRouteSearch({ myWorkLens: "bogus" })).toEqual({});
  });

  it("applies the beta default lens only when no lens has been persisted", () => {
    const storage = new Map<string, string>([
      ["t3team:beta-flags", JSON.stringify({ digestDefaultLens: "board" })],
    ]);
    const windowStub = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as Window & typeof globalThis;
    Object.defineProperty(globalThis, "window", {
      value: windowStub,
      configurable: true,
      writable: true,
    });

    expect(resolveProjectDashboardMyWorkState({}).lens).toBe("board");
    // A persisted lens wins over the beta default.
    expect(resolveProjectDashboardMyWorkState({ persisted: { lens: "hierarchy" } }).lens).toBe(
      "hierarchy",
    );
  });
});
