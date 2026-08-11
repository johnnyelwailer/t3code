import { describe, expect, it } from "vite-plus/test";

import type { ProjectThread } from "~/t3team/t3team-types";
import { buildChildThreadRelations } from "./t3team-useChildThreadRelations";

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

describe("buildChildThreadRelations", () => {
  it("marks child threads whose parent is present and counts them on the parent", () => {
    const parent = createThread({ id: "parent-1" });
    const childA = createThread({ id: "child-a", parentThreadId: "parent-1", status: "running" });
    const childB = createThread({ id: "child-b", parentThreadId: "parent-1", status: "idle" });
    const sibling = createThread({ id: "sibling-1" });

    const relations = buildChildThreadRelations([parent, childA, childB, sibling]);

    expect(relations.childThreadIds.has("child-a")).toBe(true);
    expect(relations.childThreadIds.has("child-b")).toBe(true);
    expect(relations.childThreadIds.has("parent-1")).toBe(false);
    expect(relations.childThreadIds.has("sibling-1")).toBe(false);
    expect(relations.subRunCountsByParentId.get("parent-1")).toEqual({ total: 2, running: 1 });
  });

  it("never orphan-hides a thread whose parent is missing or unknown", () => {
    const orphan = createThread({ id: "orphan-1", parentThreadId: "does-not-exist" });

    const relations = buildChildThreadRelations([orphan]);

    expect(relations.childThreadIds.has("orphan-1")).toBe(false);
    expect(relations.subRunCountsByParentId.size).toBe(0);
  });

  it("returns empty relations for threads with no parent/child links", () => {
    const relations = buildChildThreadRelations([createThread({ id: "solo-1" })]);

    expect(relations.childThreadIds.size).toBe(0);
    expect(relations.subRunCountsByParentId.size).toBe(0);
  });
});
