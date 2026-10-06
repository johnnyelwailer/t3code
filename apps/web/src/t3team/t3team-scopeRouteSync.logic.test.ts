import { describe, expect, it } from "vite-plus/test";

import { readScopeFooterActiveEntry, resolveScopeRouteTarget } from "./t3team-scopeRouteSync.logic";

const target = (pathname: string, search: Record<string, unknown>, scopeProjectId: string | null) =>
  resolveScopeRouteTarget({ pathname, search, scopeProjectId });

describe("resolveScopeRouteTarget", () => {
  it("moves the all-projects my-work view to the picked project's my-work board", () => {
    expect(target("/t3team/my-work", {}, "b")).toEqual({
      to: "/t3team/projects/$projectId",
      params: { projectId: "b" },
      search: { projectView: "my-work" },
    });
  });

  it("keeps the board a project route shows when the scope moves to another project", () => {
    expect(target("/t3team/projects/a", { projectView: "backlog" }, "b")).toEqual({
      to: "/t3team/projects/$projectId",
      params: { projectId: "b" },
      search: { projectView: "backlog" },
    });
    expect(target("/t3team/projects/a", {}, "b")).toEqual({
      to: "/t3team/projects/$projectId",
      params: { projectId: "b" },
      search: { projectView: "my-work" },
    });
  });

  it("goes to all-projects my-work on All projects, backlog included", () => {
    expect(target("/t3team/projects/a", { projectView: "my-work" }, null)).toEqual({
      to: "/t3team/my-work",
    });
    expect(target("/t3team/projects/a", { projectView: "backlog" }, null)).toEqual({
      to: "/t3team/my-work",
    });
  });

  it("stays put when the route already shows the scope", () => {
    expect(target("/t3team/projects/b", { projectView: "my-work" }, "b")).toBeNull();
    expect(target("/t3team/my-work", {}, null)).toBeNull();
  });

  it("stays put when the board shows another member of the scoped group", () => {
    expect(
      resolveScopeRouteTarget({
        pathname: "/t3team/projects/stored-1",
        search: { projectView: "backlog" },
        scopeProjectId: "live-1",
        scopeMemberProjectIds: ["live-1", "stored-1"],
      }),
    ).toBeNull();
  });

  it("never yanks the user off a thread, ticket, draft, embedded chat or non-team page", () => {
    expect(target("/t3team/projects/a/threads/t1", {}, "b")).toBeNull();
    expect(target("/t3team/projects/a/tickets/T-1", {}, "b")).toBeNull();
    expect(target("/t3team/drafts/d1", {}, "b")).toBeNull();
    expect(target("/t3team/projects/a", { chatThreadId: "t1" }, "b")).toBeNull();
    expect(target("/t3team", {}, "b")).toBeNull();
    expect(target("/pull-requests", {}, "b")).toBeNull();
  });
});

describe("readScopeFooterActiveEntry", () => {
  it("lights My work for the all-projects view and a project's my-work board", () => {
    expect(readScopeFooterActiveEntry("/t3team/my-work", {})).toBe("my-work");
    expect(readScopeFooterActiveEntry("/t3team/projects/a", {})).toBe("my-work");
    expect(readScopeFooterActiveEntry("/t3team/projects/a", { projectView: "my-work" })).toBe(
      "my-work",
    );
  });

  it("lights Backlog for a project's backlog board", () => {
    expect(readScopeFooterActiveEntry("/t3team/projects/a", { projectView: "backlog" })).toBe(
      "backlog",
    );
  });

  it("lights nothing elsewhere", () => {
    expect(readScopeFooterActiveEntry("/t3team/projects/a/threads/t1", {})).toBeNull();
    expect(readScopeFooterActiveEntry("/settings", {})).toBeNull();
  });
});
