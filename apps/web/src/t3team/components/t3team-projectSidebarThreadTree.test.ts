import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectThread } from "~/t3team/t3team-types";
import { ProjectSidebarThreadTreeRows } from "./t3team-ProjectSidebarThreadTreeRows";
import {
  buildProjectSidebarThreadTree,
  countProjectSidebarThreadBranches,
  pageSubRunThreads,
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

describe("pageSubRunThreads", () => {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

  it("orders by lifecycle group (active, waiting, idle, settled), createdAt newest-first within", () => {
    const created = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
    const threads = [
      createThread({ id: "settled-new", status: "completed", createdAt: created(1) }),
      createThread({ id: "running-old", status: "running", createdAt: created(5) }),
      createThread({ id: "idle-new", status: "idle", createdAt: created(2) }),
      createThread({ id: "error-new", status: "error", createdAt: created(1) }),
      createThread({ id: "running-new", status: "running", createdAt: created(1) }),
      createThread({ id: "settled-old", status: "completed", createdAt: created(9) }),
      createThread({ id: "idle-old", status: "idle", createdAt: created(8) }),
    ];
    const page = pageSubRunThreads(threads, true);
    expect(page.visible.map((t) => t.id)).toEqual([
      "running-new",
      "running-old",
      "error-new",
      "idle-new",
      "idle-old",
      "settled-new",
      "settled-old",
    ]);
  });

  it("keeps the order stable while active sub-runs keep messaging (no reshuffle)", () => {
    // Regression: the old sort key was lastMessageAt, so every message from a running child
    // re-sorted the list. Activity must NEVER reorder the list — the order may only move on
    // createdAt (a new child) or a lifecycle state transition.
    const created = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
    const threads = [
      createThread({ id: "s-2", status: "running", createdAt: created(2) }),
      createThread({ id: "s-1", status: "running", createdAt: created(1) }),
      createThread({ id: "s-3", status: "running", createdAt: created(3) }),
      createThread({ id: "s-0", status: "running", createdAt: created(4) }),
    ];
    // Each tick, a DIFFERENT child gets the newest lastMessageAt — exactly the pattern that
    // reshuffled the list before the fix. The rendered order must not change.
    const order = pageSubRunThreads(threads, true).visible.map((t) => t.id);
    for (const leader of ["s-3", "s-0", "s-2"]) {
      for (const t of threads) {
        t.lastMessageAt = leader === t.id ? at(0) : at(30);
      }
      expect(pageSubRunThreads(threads, true).visible.map((t) => t.id)).toEqual(order);
    }
    // Lifecycle transition IS a reordering event: s-3 settles and drops to the settled group.
    threads.find((t) => t.id === "s-3")!.status = "completed";
    expect(pageSubRunThreads(threads, true).visible.map((t) => t.id)).toEqual([
      "s-1",
      "s-2",
      "s-0",
      "s-3",
    ]);
  });

  it("caps at the limit in stable order with a hidden count", () => {
    const created = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
    // 14 running threads, s-0 newest by createdAt; the lastMessageAt values are deliberately
    // in the opposite order so a recency sort would pick different visible rows.
    const threads = Array.from({ length: 14 }, (_, i) =>
      createThread({
        id: `s-${i}`,
        title: `Sub-run ${i}`,
        status: "running",
        createdAt: created(i),
        lastMessageAt: at(i * 2),
      }),
    );
    const page = pageSubRunThreads(threads, false);
    expect(page.visible.length).toBe(10);
    expect(page.visible[0]!.id).toBe("s-0"); // newest createdAt first
    expect(page.visible[9]!.id).toBe("s-9");
    expect(page.hiddenCount).toBe(4);
    expect(page.visible.some((t) => t.id === "s-10")).toBe(false);
  });

  it("shows all threads when showAll is true (no cap, no hidden)", () => {
    const created = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
    const threads = Array.from({ length: 14 }, (_, i) =>
      createThread({ id: `s-${i}`, status: "running", createdAt: created(i) }),
    );
    const page = pageSubRunThreads(threads, true);
    expect(page.visible.length).toBe(14);
    expect(page.hiddenCount).toBe(0);
    expect(page.visible[0]!.id).toBe("s-0");
  });

  it("does not cap when within the limit", () => {
    const threads = Array.from({ length: 3 }, (_, i) =>
      createThread({ id: `s-${i}`, createdAt: at(i) }),
    );
    const page = pageSubRunThreads(threads, false);
    expect(page.visible.length).toBe(3);
    expect(page.hiddenCount).toBe(0);
  });

  it("breaks createdAt ties by id", () => {
    const threads = [
      createThread({ id: "a", createdAt: at(5) }),
      createThread({ id: "b", createdAt: at(5) }),
    ];
    const page = pageSubRunThreads(threads, false);
    expect(page.visible.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const input = [
      createThread({ id: "a", lastMessageAt: at(5) }),
      createThread({ id: "b", lastMessageAt: at(1) }),
    ];
    pageSubRunThreads(input, false);
    expect(input.map((t) => t.id)).toEqual(["a", "b"]);
  });
});
