import { describe, expect, it } from "vite-plus/test";

import {
  findT3TeamSurfaceByKind,
  isT3TeamSessionScopedPanelKey,
  MY_WORK_PANEL_REF,
  parseT3TeamForkSurface,
  pullRequestSurfaceViewEqual,
  roundTripT3TeamForkSurface,
  serializeT3TeamForkSurface,
  t3TeamIsRetiredRightPanelKind,
  T3_TEAM_MY_WORK_PANEL,
  T3_TEAM_MY_WORK_PANEL_ID,
  T3_TEAM_MY_WORK_PANEL_KIND,
  T3_TEAM_PULL_REQUEST_VIEW,
  T3_TEAM_PULL_REQUEST_VIEW_KIND,
  T3_TEAM_SURFACE_ENTRIES,
  type PullRequestSurfaceView,
  type T3TeamForkSurface,
} from "./t3team-surfaceRegistry";

describe("t3team surface registry", () => {
  it("registers exactly the fork's two surfaces with unique t3team kinds", () => {
    expect(T3_TEAM_SURFACE_ENTRIES.map((entry) => entry.kind)).toEqual([
      T3_TEAM_MY_WORK_PANEL_KIND,
      T3_TEAM_PULL_REQUEST_VIEW_KIND,
    ]);
    expect(findT3TeamSurfaceByKind("t3team.my-work")).toBe(T3_TEAM_MY_WORK_PANEL);
    expect(findT3TeamSurfaceByKind("t3team.pull-request-view")).toBe(T3_TEAM_PULL_REQUEST_VIEW);
    expect(findT3TeamSurfaceByKind("t3team.thread")).toBeNull();
    expect(findT3TeamSurfaceByKind("thread")).toBeNull();
    expect(findT3TeamSurfaceByKind("upstream.kind")).toBeNull();
  });

  it("maps every fork surface, My Work included, onto upstream's one surface tab", () => {
    expect(T3_TEAM_SURFACE_ENTRIES.map((entry) => entry.tabKind)).toEqual(["surface", "surface"]);
  });

  it("gives the my-work panel its scoped key as its stable id", () => {
    expect(T3_TEAM_MY_WORK_PANEL_ID).toBe(
      `${MY_WORK_PANEL_REF.environmentId}:${MY_WORK_PANEL_REF.threadId}`,
    );
    expect(T3_TEAM_MY_WORK_PANEL.idOf({})).toBe(T3_TEAM_MY_WORK_PANEL_ID);
  });

  it("round-trips the my-work panel through JSON", () => {
    const surface: T3TeamForkSurface = {
      kind: T3_TEAM_MY_WORK_PANEL_KIND,
      id: T3_TEAM_MY_WORK_PANEL_ID,
      params: {},
    };
    const json = JSON.stringify(serializeT3TeamForkSurface(surface));
    expect(JSON.parse(json)).toEqual({
      kind: "t3team.my-work",
      id: T3_TEAM_MY_WORK_PANEL_ID,
      params: {},
    });
    expect(roundTripT3TeamForkSurface(surface)).toEqual(surface);
    expect(parseT3TeamForkSurface(JSON.parse(json))).toEqual(surface);
  });

  it("round-trips a pull-request view through JSON with its surface id", () => {
    const view: PullRequestSurfaceView = { tab: "code", file: "src/a.ts", commit: "abc123" };
    const surface: T3TeamForkSurface = {
      kind: T3_TEAM_PULL_REQUEST_VIEW_KIND,
      id: "pr-123",
      params: {
        surfaceId: "pr-123",
        view: { tab: view.tab, file: view.file, commit: view.commit },
      },
    };
    const json = JSON.stringify(serializeT3TeamForkSurface(surface));
    expect(JSON.parse(json)).toEqual({
      kind: "t3team.pull-request-view",
      id: "pr-123",
      params: { surfaceId: "pr-123", view: { tab: "code", file: "src/a.ts", commit: "abc123" } },
    });
    expect(roundTripT3TeamForkSurface(surface)).toEqual(surface);
    expect(parseT3TeamForkSurface(JSON.parse(json))).toEqual(surface);
  });

  it("rejects a persisted entry whose id disagrees with its params", () => {
    expect(
      parseT3TeamForkSurface({
        kind: "t3team.pull-request-view",
        id: "other",
        params: { surfaceId: "pr-1" },
      }),
    ).toBeNull();
    expect(
      parseT3TeamForkSurface({
        kind: "t3team.pull-request-view",
        id: "pr-1",
        params: { surfaceId: "pr-2", view: { tab: "code" } },
      }),
    ).toBeNull();
  });

  it("rejects unknown kinds, absent params and hostile values", () => {
    expect(parseT3TeamForkSurface({ kind: "t3team.threads", params: {} })).toBeNull();
    expect(parseT3TeamForkSurface({ kind: "diff", id: "diff", params: {} })).toBeNull();
    expect(parseT3TeamForkSurface({ kind: "t3team.pull-request-view", params: "nope" })).toBeNull();
    expect(
      parseT3TeamForkSurface({
        kind: "t3team.pull-request-view",
        params: { surfaceId: "", view: {} },
      }),
    ).toBeNull();
    expect(
      parseT3TeamForkSurface({ kind: "t3team.pull-request-view", params: { surfaceId: "pr-1" } }),
    ).toBeNull();
    expect(parseT3TeamForkSurface(null)).toBeNull();
    expect(parseT3TeamForkSurface("t3team.my-work")).toBeNull();
    expect(parseT3TeamForkSurface([1, 2])).toBeNull();
  });

  it("throws when serializing an unregistered kind", () => {
    expect(() =>
      serializeT3TeamForkSurface({ kind: "t3team.nope", id: "x", params: {} }),
    ).toThrowError(/Unregistered t3team surface kind/);
  });

  it("treats exactly the shared panel keys as session-scoped", () => {
    expect(isT3TeamSessionScopedPanelKey("env-1:my-work-panel")).toBe(true);
    expect(isT3TeamSessionScopedPanelKey("env-1:pull-requests-panel")).toBe(true);
    expect(isT3TeamSessionScopedPanelKey("env-1:thread-A")).toBe(false);
    expect(isT3TeamSessionScopedPanelKey("my-work-panel")).toBe(false);
  });

  it("lists the retired thread kind and no live kind as retired", () => {
    expect(t3TeamIsRetiredRightPanelKind("thread")).toBe(true);
    expect(t3TeamIsRetiredRightPanelKind("side-chat")).toBe(false);
    expect(t3TeamIsRetiredRightPanelKind("pull-request")).toBe(false);
    expect(t3TeamIsRetiredRightPanelKind("diff")).toBe(false);
  });

  it("reads the pull-request view back exactly as the store compares it", () => {
    const stored: PullRequestSurfaceView = { tab: "guide", file: null, commit: null };
    const reported: PullRequestSurfaceView = { tab: "guide", file: null, commit: null };
    expect(pullRequestSurfaceViewEqual(stored, reported)).toBe(true);
    expect(pullRequestSurfaceViewEqual(stored, { ...stored, tab: "code" })).toBe(false);
    expect(pullRequestSurfaceViewEqual(undefined, stored)).toBe(false);
  });
});
