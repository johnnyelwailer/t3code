import { describe, expect, it } from "vite-plus/test";

import {
  buildUpstreamBridgeNavigation,
  isT3TeamShellPath,
  isTeamShellEnvironment,
  translateUpstreamPath,
} from "./t3team-upstreamRouteBridge.ts";

const deps = (projectId: string | null, primaryEnvironmentId: string | null = "local") => ({
  resolveProjectIdForThread: () => projectId,
  primaryEnvironmentId,
});

describe("isT3TeamShellPath", () => {
  it("matches the shell root and its children only", () => {
    expect(isT3TeamShellPath("/t3team")).toBe(true);
    expect(isT3TeamShellPath("/t3team/projects/p1")).toBe(true);
    expect(isT3TeamShellPath("/t3teamx")).toBe(false);
    expect(isT3TeamShellPath("/")).toBe(false);
  });
});

describe("translateUpstreamPath", () => {
  it("leaves shell, settings and pairing routes alone", () => {
    for (const pathname of [
      "/t3team",
      "/t3team/projects/p1",
      "/settings",
      "/settings/beta",
      "/usage",
      "/usage/deep",
      "/pair",
      "/connect",
      "/connect_/callback",
      "/connect-agent",
      // FirstRunGate owns the onboarding wizard's navigation; bouncing
      // /welcome onto /t3team is an infinite redirect loop.
      "/welcome",
      "/pull-requests",
      "/projects/my-project-key",
      "/usage",
    ]) {
      expect(translateUpstreamPath(pathname, deps("p1"))).toEqual({ kind: "ignore" });
    }
  });

  it("leaves the MCP OAuth approval page alone", () => {
    // Regression: "/connect" matching is exact-or-"/connect/…", so "/connect-agent" was read as
    // unhandled and bounced to /t3team's pairing gate mid OAuth approval.
    expect(translateUpstreamPath("/connect-agent", deps("p1"))).toEqual({ kind: "ignore" });
    expect(translateUpstreamPath("/connect-agent", deps(null))).toEqual({ kind: "ignore" });
    expect(translateUpstreamPath("/connect-agents", deps("p1"))).toEqual({ kind: "unhandled" });
  });

  it("maps upstream's root to the team dashboard", () => {
    expect(translateUpstreamPath("/", deps("p1"))).toEqual({
      kind: "target",
      target: { to: "/t3team" },
    });
  });

  it("maps an upstream thread route onto the team thread route", () => {
    expect(translateUpstreamPath("/local/thread-7", deps("project-3"))).toEqual({
      kind: "target",
      target: {
        to: "/t3team/projects/$projectId/threads/$threadId",
        params: { projectId: "project-3", threadId: "thread-7" },
      },
    });
  });

  it("decodes escaped id segments", () => {
    expect(translateUpstreamPath("/env%2Fa/thread%2Fb", deps("project-3", "env/a"))).toEqual({
      kind: "target",
      target: {
        to: "/t3team/projects/$projectId/threads/$threadId",
        params: { projectId: "project-3", threadId: "thread/b" },
      },
    });
  });

  it("maps upstream's draft route onto the team draft route", () => {
    // Regression: `/draft/<id>` also matches the two-segment thread shape, so it
    // used to resolve as thread "<id>" in environment "draft", fail, and bounce
    // the whole new-thread action back to the dashboard.
    expect(translateUpstreamPath("/draft/draft-9", deps(null))).toEqual({
      kind: "target",
      target: { to: "/t3team/drafts/$draftId", params: { draftId: "draft-9" } },
    });
  });

  it("prefers a real thread over the draft shape when an environment is named 'draft'", () => {
    // `environmentId` is an opaque non-empty string, so "draft" is a legal
    // environment name. Resolving the thread first keeps that thread reachable
    // instead of hijacking it into a draft that does not exist.
    expect(translateUpstreamPath("/draft/thread-7", deps("project-3", "draft"))).toEqual({
      kind: "target",
      target: {
        to: "/t3team/projects/$projectId/threads/$threadId",
        params: { projectId: "project-3", threadId: "thread-7" },
      },
    });
  });

  it("decodes escaped draft ids", () => {
    expect(translateUpstreamPath("/draft/draft%2F9", deps(null))).toEqual({
      kind: "target",
      target: { to: "/t3team/drafts/$draftId", params: { draftId: "draft/9" } },
    });
  });

  it("leaves a thread on another machine on upstream's environment-scoped route", () => {
    // The Team thread view talks to the primary server only: translating a cloud-session thread
    // made it look the thread up locally, miss, and re-create it there ("project does not exist").
    expect(translateUpstreamPath("/cloud/thread-7", deps("project-3"))).toEqual({ kind: "ignore" });
    // "draft" is not the primary id either, but no thread resolves: still the draft route.
    expect(translateUpstreamPath("/draft/draft-9", deps(null))).toEqual({
      kind: "target",
      target: { to: "/t3team/drafts/$draftId", params: { draftId: "draft-9" } },
    });
  });

  it("does not move a thread into the Team shell before the primary environment is known", () => {
    // Once on a Team route the bridge is off, so a remote thread translated early would be stuck.
    expect(translateUpstreamPath("/local/thread-7", deps("project-3", null))).toEqual({
      kind: "ignore",
    });
    expect(isTeamShellEnvironment("local", null)).toBe(false);
    expect(isTeamShellEnvironment("local", "local")).toBe(true);
  });

  it("reports unhandled when the thread's project is unknown", () => {
    expect(translateUpstreamPath("/local/thread-7", deps(null))).toEqual({ kind: "unhandled" });
  });

  it("reports unhandled for paths that are not upstream thread routes", () => {
    for (const pathname of ["/threads", "/a/b/c", "/local/thread/extra"]) {
      expect(translateUpstreamPath(pathname, deps("p1"))).toEqual({ kind: "unhandled" });
    }
  });
});

describe("buildUpstreamBridgeNavigation", () => {
  it("always replaces so Back cannot re-enter the upstream thread path", () => {
    expect(
      buildUpstreamBridgeNavigation({
        kind: "target",
        target: {
          to: "/t3team/projects/$projectId/threads/$threadId",
          params: { projectId: "project-3", threadId: "thread-7" },
        },
      }),
    ).toEqual({
      to: "/t3team/projects/$projectId/threads/$threadId",
      params: { projectId: "project-3", threadId: "thread-7" },
      replace: true,
    });
  });

  it("replaces unhandled upstream paths onto the team dashboard", () => {
    expect(buildUpstreamBridgeNavigation({ kind: "unhandled" })).toEqual({
      to: "/t3team",
      replace: true,
    });
  });
});
