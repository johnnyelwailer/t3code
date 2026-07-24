import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectThread } from "~/t3team/t3team-types";
import { ProjectSidebarThreadTreeRows } from "./t3team-ProjectSidebarThreadTreeRows";
import {
  buildProjectSidebarThreadTree,
  countProjectSidebarThreadBranches,
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
