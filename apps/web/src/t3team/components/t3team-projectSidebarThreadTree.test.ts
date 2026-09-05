import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectThread } from "~/t3team/t3team-types";
import { ProjectSidebarThreadTreeRows } from "./t3team-ProjectSidebarThreadTreeRows";
import {
  buildProjectSidebarThreadTree,
  countProjectSidebarThreadBranches,
  partitionSubRunThreads,
  sortFoldedSubRunThreads,
} from "./t3team-projectSidebarThreadTree";

function createThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: overrides.id ?? "thread-1",
    projectId: overrides.projectId ?? "project-1",
    title: overrides.title ?? "Thread",
    status: overrides.status ?? "idle",
    messageCount: overrides.messageCount ?? 0,
    lastMessageAt: overrides.lastMessageAt ?? "2026-05-26T12:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-05-26T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildProjectSidebarThreadTree", () => {
  it("nests child threads under their parent when both are present", () => {
    const parentThread = createThread({ id: "thread-parent", ticketId: "ticket-1" });
    const childThread = createThread({
      id: "thread-child",
      ticketId: "ticket-1",
      parentThreadId: "thread-parent",
    });
    const siblingThread = createThread({ id: "thread-sibling", ticketId: "ticket-1" });

    const tree = buildProjectSidebarThreadTree([parentThread, childThread, siblingThread]);

    expect(tree.rootThreads).toEqual([parentThread, siblingThread]);
    expect(tree.childThreadsByParentId.get("thread-parent")).toEqual([childThread]);
  });

  it("keeps threads at the root when their parent is missing", () => {
    const orphanThread = createThread({
      id: "thread-orphan",
      ticketId: "ticket-1",
      parentThreadId: "thread-missing",
    });

    const tree = buildProjectSidebarThreadTree([orphanThread]);

    expect(tree.rootThreads).toEqual([orphanThread]);
    expect(tree.childThreadsByParentId.size).toBe(0);
  });

  it("counts a visible root and all of its nested descendants", () => {
    const parent = createThread({ id: "parent" });
    const child = createThread({ id: "child", parentThreadId: "parent" });
    const grandchild = createThread({ id: "grandchild", parentThreadId: "child" });
    const hiddenRoot = createThread({ id: "hidden-root" });
    const tree = buildProjectSidebarThreadTree([parent, child, grandchild, hiddenRoot]);

    expect(countProjectSidebarThreadBranches([parent], tree)).toBe(3);
  });

  it("renders descendant controls expanded by default", () => {
    const parent = createThread({ id: "parent", title: "Parent" });
    const child = createThread({ id: "child", title: "Child", parentThreadId: "parent" });
    const tree = buildProjectSidebarThreadTree([parent, child]);
    const markup = renderToStaticMarkup(
      createElement(ProjectSidebarThreadTreeRows, {
        projectId: "project-1",
        roots: tree.rootThreads,
        tree,
        view: null,
        workspacePath: null,
        onSelectThread: () => {},
        onDeleteThread: () => {},
        onRenameThread: () => {},
      }),
    );

    expect(markup).toContain('aria-label="Collapse child threads for Parent"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Child");
  });
});

describe("partitionSubRunThreads / sortFoldedSubRunThreads (GHE #304 fold)", () => {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

  it("splits on running vs non-running — everything else folds, even a fresh error", () => {
    const threads = [
      createThread({ id: "run-1", status: "running" }),
      createThread({ id: "err-1", status: "error" }),
      createThread({ id: "idle-1", status: "idle" }),
      createThread({ id: "done-1", status: "completed" }),
    ];
    const { running, folded } = partitionSubRunThreads(threads);
    expect(running.map((t) => t.id)).toEqual(["run-1"]);
    expect(folded.map((t) => t.id)).toEqual(["err-1", "idle-1", "done-1"]);
  });

  it("an empty fleet partitions to two empty sides (no fold row)", () => {
    const { running, folded } = partitionSubRunThreads([]);
    expect(running).toHaveLength(0);
    expect(folded).toHaveLength(0);
  });

  it("orders the fold oldest-first by last activity, id tiebreak", () => {
    const threads = [
      createThread({ id: "new", status: "completed", lastMessageAt: at(5) }),
      createThread({ id: "old", status: "error", lastMessageAt: at(90) }),
      createThread({ id: "mid", status: "idle", lastMessageAt: at(30) }),
      createThread({ id: "tie-b", status: "completed", lastMessageAt: at(60) }),
      createThread({ id: "tie-a", status: "idle", lastMessageAt: at(60) }),
    ];
    expect(sortFoldedSubRunThreads(threads).map((t) => t.id)).toEqual([
      "old",
      "tie-a",
      "tie-b",
      "mid",
      "new",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [
      createThread({ id: "a", lastMessageAt: at(5) }),
      createThread({ id: "b", lastMessageAt: at(1) }),
    ];
    partitionSubRunThreads(input);
    sortFoldedSubRunThreads(input);
    expect(input.map((t) => t.id)).toEqual(["a", "b"]);
  });
});
