import { describe, expect, it } from "vite-plus/test";

import type { ProjectThread } from "~/t3team/t3team-types";
import {
  buildSubRunTree,
  sortSubRunNodes,
  STATUS_PRIORITY,
} from "./t3team-AgentsPanelForkSection.logic";

function createThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: overrides.id ?? "child-1",
    projectId: overrides.projectId ?? "project-1",
    title: overrides.title ?? "Sub-run thread",
    status: overrides.status ?? "running",
    messageCount: 0,
    lastMessageAt: overrides.lastMessageAt ?? new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildSubRunTree", () => {
  it("builds a nested tree from the parentId->children map", () => {
    const grandchild = createThread({ id: "gc-1" });
    const child = createThread({ id: "c-1" });
    const other = createThread({ id: "c-2" });
    const tree = buildSubRunTree(
      "root",
      new Map([
        ["root", [child, other]],
        ["c-1", [grandchild]],
      ]),
    );
    expect(tree.map((node) => node.thread.id)).toEqual(["c-1", "c-2"]);
    expect(tree[0]!.children.map((node) => node.thread.id)).toEqual(["gc-1"]);
    expect(tree[1]!.children).toEqual([]);
  });

  it("returns an empty tree when the root has no children", () => {
    expect(buildSubRunTree("root", new Map())).toEqual([]);
  });

  it("stops at a cycle instead of recursing forever", () => {
    const a = createThread({ id: "a" });
    const b = createThread({ id: "b" });
    const tree = buildSubRunTree(
      "root",
      new Map([
        ["root", [a]],
        ["a", [b]],
        ["b", [a]],
      ]),
    );
    // The cyclic back-reference still renders — but as a leaf, so the tree is finite.
    expect(tree[0]!.thread.id).toBe("a");
    expect(tree[0]!.children.map((node) => node.thread.id)).toEqual(["b"]);
    const bNode = tree[0]!.children[0]!;
    expect(bNode.children.map((node) => node.thread.id)).toEqual(["a"]);
    expect(bNode.children[0]!.children).toEqual([]);
  });

  it("treats a mapping back to the root as a leaf", () => {
    const a = createThread({ id: "a" });
    const tree = buildSubRunTree(
      "root",
      new Map([
        ["root", [a]],
        ["a", [createThread({ id: "root" })]],
      ]),
    );
    expect(tree[0]!.children.map((node) => node.thread.id)).toEqual(["root"]);
    expect(tree[0]!.children[0]!.children).toEqual([]);
  });
});

describe("sortSubRunNodes", () => {
  it("orders running, error, completed, idle — most recent first within a status", () => {
    const now = Date.now();
    const at = (offsetMinutes: number) => new Date(now + offsetMinutes * 60_000).toISOString();
    const nodes = [
      { thread: createThread({ id: "idle", status: "idle", lastMessageAt: at(50) }), children: [] },
      {
        thread: createThread({ id: "old-done", status: "completed", lastMessageAt: at(0) }),
        children: [],
      },
      {
        thread: createThread({ id: "error", status: "error", lastMessageAt: at(10) }),
        children: [],
      },
      {
        thread: createThread({ id: "new-done", status: "completed", lastMessageAt: at(20) }),
        children: [],
      },
      {
        thread: createThread({ id: "running", status: "running", lastMessageAt: at(-10) }),
        children: [],
      },
    ];
    expect(sortSubRunNodes(nodes).map((node) => node.thread.id)).toEqual([
      "running",
      "error",
      "new-done",
      "old-done",
      "idle",
    ]);
  });

  it("does not mutate its input", () => {
    const a = { thread: createThread({ id: "a", status: "idle" }), children: [] };
    const b = { thread: createThread({ id: "b", status: "running" }), children: [] };
    const input = [a, b];
    sortSubRunNodes(input);
    expect(input.map((node) => node.thread.id)).toEqual(["a", "b"]);
  });
});

describe("STATUS_PRIORITY", () => {
  it("ranks working above errors above settled above idle", () => {
    expect(STATUS_PRIORITY.running).toBeLessThan(STATUS_PRIORITY.error);
    expect(STATUS_PRIORITY.error).toBeLessThan(STATUS_PRIORITY.completed);
    expect(STATUS_PRIORITY.completed).toBeLessThan(STATUS_PRIORITY.idle);
  });
});
