import { describe, expect, it } from "vite-plus/test";

import { isT3TeamShellPath, translateUpstreamPath } from "./t3team-upstreamRouteBridge.ts";

const deps = (projectId: string | null) => ({
  resolveProjectIdForThread: () => projectId,
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
      "/pair",
      "/connect",
      "/connect_/callback",
    ]) {
      expect(translateUpstreamPath(pathname, deps("p1"))).toEqual({ kind: "ignore" });
    }
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
    expect(translateUpstreamPath("/env%2Fa/thread%2Fb", deps("project-3"))).toEqual({
      kind: "target",
      target: {
        to: "/t3team/projects/$projectId/threads/$threadId",
        params: { projectId: "project-3", threadId: "thread/b" },
      },
    });
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
