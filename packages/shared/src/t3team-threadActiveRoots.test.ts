import { describe, expect, it } from "vite-plus/test";

import {
  selectThreadActiveRoots,
  threadFollowRoot,
  THREAD_ACTIVE_ROOTS_HARD_CAP,
  threadRootCandidates,
  type ThreadRootCandidate,
  type ThreadRootShell,
} from "./t3team-threadActiveRoots.ts";

const child = (path: string, extra: Partial<ThreadRootCandidate> = {}): ThreadRootCandidate => ({
  path,
  exists: true,
  ...extra,
});

describe("selectThreadActiveRoots", () => {
  it("gives an old thread with no children just its own checkout", () => {
    expect(selectThreadActiveRoots([{ path: "/repo", primary: true, exists: true }])).toEqual([
      { path: "/repo", reason: "primary" },
    ]);
  });

  it("drops settled clean worktrees: recently touched alone never qualifies", () => {
    const roots = selectThreadActiveRoots([
      { path: "/repo", primary: true },
      child("/repo/.t3team/child-session-worktrees/a", { updatedAtMs: 1_700_000_000_000 }),
      child("/repo/.t3team/child-session-worktrees/b", { runningChild: true }),
    ]);
    expect(roots.map((root) => root.path)).toEqual([
      "/repo",
      "/repo/.t3team/child-session-worktrees/b",
    ]);
  });

  it("skips missing folders quietly, even the current worktree", () => {
    const roots = selectThreadActiveRoots([
      { path: "/wt/deleted", current: true, exists: false },
      { path: "/repo", primary: true, exists: true },
      child("/wt/gone", { runningChild: true, exists: false }),
    ]);
    expect(roots).toEqual([{ path: "/repo", reason: "primary" }]);
  });

  it("orders current, primary, running (newest first), open PR, dirty", () => {
    const roots = selectThreadActiveRoots([
      child("/dirty", { dirty: true }),
      child("/pr", { openPullRequest: true }),
      child("/run-old", { runningChild: true, updatedAtMs: 1 }),
      child("/run-new", { runningChild: true, updatedAtMs: 2 }),
      { path: "/repo", primary: true },
      { path: "/wt/current", current: true },
    ]);
    expect(roots.map((root) => root.reason)).toEqual([
      "current",
      "primary",
      "running-child",
      "running-child",
      "open-pr",
      "dirty",
    ]);
    expect(roots[2]!.path).toBe("/run-new");
  });

  it("merges a folder shared by many children once, under its strongest reason", () => {
    const shared = "/repo/.t3team/child-session-worktrees/shared";
    const candidates = Array.from({ length: 205 }, (_, index) =>
      child(shared, { dirty: index === 3, runningChild: index === 200, updatedAtMs: index }),
    );
    expect(selectThreadActiveRoots(candidates)).toEqual([
      { path: shared, reason: "running-child" },
    ]);
  });

  it("compares Windows paths case-insensitively and with either separator", () => {
    const roots = selectThreadActiveRoots([
      { path: "D:\\wt\\Feature", current: true },
      child("d:/wt/feature", { runningChild: true }),
    ]);
    expect(roots).toEqual([{ path: "D:\\wt\\Feature", reason: "current" }]);
  });

  it("caps at 8 by default and never above 12; the weakest tiers drop first", () => {
    const candidates = [
      { path: "/repo", primary: true },
      ...Array.from({ length: 20 }, (_, index) => child(`/dirty/${index}`, { dirty: true })),
      ...Array.from({ length: 3 }, (_, index) => child(`/run/${index}`, { runningChild: true })),
    ];
    const roots = selectThreadActiveRoots(candidates);
    expect(roots).toHaveLength(8);
    expect(roots.slice(0, 4).map((root) => root.reason)).toEqual([
      "primary",
      "running-child",
      "running-child",
      "running-child",
    ]);
    expect(selectThreadActiveRoots(candidates, { cap: 50 })).toHaveLength(
      THREAD_ACTIVE_ROOTS_HARD_CAP,
    );
  });

  it("keeps an unchecked folder (exists unknown) for the caller to verify", () => {
    expect(selectThreadActiveRoots([{ path: "/x", runningChild: true }])).toEqual([
      { path: "/x", reason: "running-child" },
    ]);
  });
});

describe("threadFollowRoot", () => {
  it("follows the one extra root", () => {
    const roots = selectThreadActiveRoots([
      { path: "/repo", primary: true },
      child("/repo/.t3team/child-session-worktrees/a", { runningChild: true }),
    ]);
    expect(threadFollowRoot(roots, "/repo")).toBe("/repo/.t3team/child-session-worktrees/a");
  });

  it("never guesses among several extra roots", () => {
    const roots = selectThreadActiveRoots([
      { path: "/repo", primary: true },
      child("/a", { runningChild: true }),
      child("/b", { dirty: true }),
    ]);
    expect(threadFollowRoot(roots, "/repo")).toBeNull();
  });

  it("does not follow the thread's own cwd or a thread with no extra roots", () => {
    expect(threadFollowRoot([{ path: "/repo", reason: "primary" }], "/repo")).toBeNull();
    expect(threadFollowRoot([{ path: "/a", reason: "running-child" }], "/a")).toBeNull();
    expect(threadFollowRoot([], null)).toBeNull();
  });
});

const shell = (id: string, extra: Partial<ThreadRootShell> = {}): ThreadRootShell => ({
  id,
  branch: null,
  worktreePath: null,
  lineage: { parentThreadId: "parent" },
  activeRunId: null,
  ...extra,
});

describe("threadRootCandidates", () => {
  it("reads the thread, its project checkout and only its direct children", () => {
    const shells = [
      shell("parent", { lineage: { parentThreadId: null }, worktreePath: "/wt/parent" }),
      shell("running", { worktreePath: "/wt/a", activeRunId: "run-1", title: "Fix CI" }),
      shell("settled", { worktreePath: "/wt/b" }),
      shell("shared-checkout", { worktreePath: null }),
      shell("grandchild", { worktreePath: "/wt/c", lineage: { parentThreadId: "running" } }),
    ];
    const roots = selectThreadActiveRoots(
      threadRootCandidates({ threadId: "parent", shells, primaryRoot: "/repo" }),
    );
    expect(roots).toEqual([
      { path: "/wt/parent", reason: "current" },
      { path: "/repo", reason: "primary" },
      { path: "/wt/a", reason: "running-child", label: "Fix CI" },
    ]);
  });

  it("counts a child's own open PR, or its branch heading an open PR on the parent", () => {
    const open = (headBranch: string, state = "open") => ({ snapshot: { state, headBranch } });
    const shells = [
      shell("parent", { lineage: { parentThreadId: null }, pullRequests: [open("feat/x")] }),
      shell("own-pr", { worktreePath: "/wt/own", pullRequests: [open("feat/own")] }),
      shell("parent-pr", { worktreePath: "/wt/x", branch: "feat/x" }),
      shell("merged-pr", { worktreePath: "/wt/m", pullRequests: [open("feat/m", "merged")] }),
    ];
    const roots = selectThreadActiveRoots(
      threadRootCandidates({ threadId: "parent", shells, primaryRoot: null }),
    );
    expect(roots.map((root) => root.path)).toEqual(["/wt/own", "/wt/x"]);
  });

  it("gives nothing for an unknown thread with no project checkout", () => {
    expect(threadRootCandidates({ threadId: "x", shells: [], primaryRoot: null })).toEqual([]);
  });
});
