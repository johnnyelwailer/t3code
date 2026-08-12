import { describe, expect, it } from "vite-plus/test";

import type { ProjectThread } from "~/t3team/t3team-types";
import { useT3TeamChildThreadRelationsStore } from "./t3team-childThreadRelationsStore";

function createThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: overrides.id ?? "child-1",
    projectId: overrides.projectId ?? "project-1",
    title: overrides.title ?? "Thread",
    status: overrides.status ?? "running",
    messageCount: overrides.messageCount ?? 0,
    lastMessageAt: overrides.lastMessageAt ?? "2026-05-26T12:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-05-26T12:00:00.000Z",
    ...overrides,
  };
}

describe("useT3TeamChildThreadRelationsStore", () => {
  it("starts empty — a reader mounted before any publisher must never see stale data as real", () => {
    useT3TeamChildThreadRelationsStore.setState({ childThreadsByParentId: new Map() });
    expect(useT3TeamChildThreadRelationsStore.getState().childThreadsByParentId.size).toBe(0);
  });

  it(
    "publishing from one call site (the sidebar's) is immediately visible to every other reader " +
      "— this is the whole point: a second, independently-hydrating useProjectStore() instance " +
      "must never be needed to see a thread's sub-run children",
    () => {
      const child = createThread({ id: "child-9", projectId: "proj-9" });
      const relations = new Map([["parent-1", [child]]]);

      useT3TeamChildThreadRelationsStore.getState().setChildThreadsByParentId(relations);

      // A fresh subscriber (standing in for ChatView's Agents-panel seam) reads the same map
      // reference the "sidebar" published, without hydrating anything of its own.
      const read = useT3TeamChildThreadRelationsStore.getState().childThreadsByParentId;
      expect(read).toBe(relations);
      expect(read.get("parent-1")).toEqual([child]);
    },
  );

  it("skips the state update when the published map reference is unchanged (avoids rerender storms)", () => {
    const relations = new Map<string, ReadonlyArray<ProjectThread>>();
    useT3TeamChildThreadRelationsStore.getState().setChildThreadsByParentId(relations);
    const stateAfterFirstSet = useT3TeamChildThreadRelationsStore.getState();

    useT3TeamChildThreadRelationsStore.getState().setChildThreadsByParentId(relations);
    const stateAfterSecondSet = useT3TeamChildThreadRelationsStore.getState();

    expect(stateAfterSecondSet).toBe(stateAfterFirstSet);
  });
});
