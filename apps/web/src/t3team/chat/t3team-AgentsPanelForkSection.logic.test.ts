import { describe, expect, it } from "vite-plus/test";

import type { ProjectThread } from "~/t3team/t3team-types";
import { SUB_RUN_LIFECYCLE_RANK } from "~/t3team/components/t3team-projectSidebarThreadTree";
import {
  buildSubRunTree,
  resolveSubRunStatusLabel,
  sortSubRunNodes,
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
  it("orders by lifecycle group first, createdAt newest-first within — never by lastMessageAt", () => {
    const now = Date.now();
    const at = (offsetMinutes: number) => new Date(now + offsetMinutes * 60_000).toISOString();
    const nodes = [
      {
        // Most recently active, but settled: recency must NOT pull it to the top.
        thread: createThread({
          id: "settled-recent",
          status: "completed",
          lastMessageAt: at(0),
          createdAt: at(-10),
        }),
        children: [],
      },
      {
        thread: createThread({
          id: "error-older",
          status: "error",
          lastMessageAt: at(-50),
          createdAt: at(-40),
        }),
        children: [],
      },
      {
        thread: createThread({
          id: "running-newer",
          status: "running",
          lastMessageAt: at(-30),
          createdAt: at(-20),
        }),
        children: [],
      },
      {
        thread: createThread({
          id: "running-older",
          status: "running",
          lastMessageAt: at(-1),
          createdAt: at(-60),
        }),
        children: [],
      },
    ];
    // Lifecycle group: running (createdAt newest-first), then error, then settled.
    expect(sortSubRunNodes(nodes).map((node) => node.thread.id)).toEqual([
      "running-newer",
      "running-older",
      "error-older",
      "settled-recent",
    ]);
  });

  it("keeps the order stable while threads keep messaging (no reshuffle)", () => {
    const at = (offsetMinutes: number) =>
      new Date(Date.now() + offsetMinutes * 60_000).toISOString();
    const make = (id: string, createdOffsetMinutes: number) => ({
      thread: createThread({ id, status: "running", createdAt: at(createdOffsetMinutes) }),
      children: [],
    });
    const nodes = [make("b", -2), make("c", -3), make("a", -1)];
    const order = sortSubRunNodes(nodes).map((node) => node.thread.id);
    // Every tick a different child gets the freshest lastMessageAt — the pattern that
    // reshuffled the list under the old recency sort. Order must not change.
    for (const leader of ["c", "a", "b"]) {
      for (const node of nodes) {
        node.thread.lastMessageAt = node.thread.id === leader ? at(0) : at(-60);
      }
      expect(sortSubRunNodes(nodes).map((node) => node.thread.id)).toEqual(order);
    }
  });

  it("breaks ties on equal createdAt by id", () => {
    const at = new Date().toISOString();
    const nodes = [
      {
        thread: createThread({ id: "completed-b", status: "completed", createdAt: at }),
        children: [],
      },
      {
        thread: createThread({ id: "completed-a", status: "completed", createdAt: at }),
        children: [],
      },
    ];
    expect(sortSubRunNodes(nodes).map((node) => node.thread.id)).toEqual([
      "completed-a",
      "completed-b",
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

describe("SUB_RUN_LIFECYCLE_RANK", () => {
  it("ranks working above waiting above idle above settled (shared with the sidebar)", () => {
    expect(SUB_RUN_LIFECYCLE_RANK.running).toBeLessThan(SUB_RUN_LIFECYCLE_RANK.error);
    expect(SUB_RUN_LIFECYCLE_RANK.error).toBeLessThan(SUB_RUN_LIFECYCLE_RANK.idle);
    expect(SUB_RUN_LIFECYCLE_RANK.idle).toBeLessThan(SUB_RUN_LIFECYCLE_RANK.completed);
  });
});

describe("resolveSubRunStatusLabel (GHE #208 panel/sidebar seam)", () => {
  it("shows the LLM activity label when it flows and the flag is on", () => {
    const thread = createThread({
      status: "running",
      activityState: "writing",
      activityLabel: "Editing the router",
    });
    expect(resolveSubRunStatusLabel(thread, { activityLabelsEnabled: true })).toBe(
      "Editing the router",
    );
  });

  it("falls back to the deterministic state word when no label flows (flag off or absent)", () => {
    const thread = createThread({ status: "running", activityState: "writing" });
    expect(resolveSubRunStatusLabel(thread, { activityLabelsEnabled: true })).toBe("Writing");
    const labeled = createThread({
      status: "running",
      activityState: "writing",
      activityLabel: "Editing the router",
    });
    expect(resolveSubRunStatusLabel(labeled, { activityLabelsEnabled: false })).toBe("Writing");
  });

  it("keeps the stable status label when neither label nor state is available", () => {
    const thread = createThread({ status: "running" });
    expect(resolveSubRunStatusLabel(thread, { activityLabelsEnabled: true })).toBe("Running");
  });

  it("never shows a live word for settled states — the stable label stands", () => {
    for (const [status, label] of [
      ["idle", "Idle"],
      ["completed", "Completed"],
      ["error", "Error"],
    ] as const) {
      const thread = createThread({
        status,
        activityState: "working",
        activityLabel: "Editing the router",
      });
      expect(resolveSubRunStatusLabel(thread, { activityLabelsEnabled: true })).toBe(label);
    }
  });
});
