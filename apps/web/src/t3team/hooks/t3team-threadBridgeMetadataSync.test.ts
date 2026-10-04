import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { syncLiveThreadMetadataToLocalState } from "./t3team-threadBridge";
import {
  makeLiveProject,
  makeLiveThreadShell,
  makeProjectThread,
  makeStoredProject,
} from "./t3team-threadBridge.testSupport";

const LIVE_SAVED = ProjectId.make("live-saved");
const storedProjects = [makeStoredProject()];
const liveProjects = [makeLiveProject({ id: LIVE_SAVED, workspaceRoot: "/workspace/saved" })];

describe("syncLiveThreadMetadataToLocalState", () => {
  it("syncs generated titles for ordinary root threads", () => {
    const result = syncLiveThreadMetadataToLocalState({
      threads: [makeProjectThread({ id: "thread-parent", title: "New thread" })],
      storedProjects,
      liveProjects,
      liveThreads: [
        makeLiveThreadShell({
          id: ThreadId.make("thread-parent"),
          projectId: LIVE_SAVED,
          title: "Generated title",
        }),
      ],
    });

    expect(result).toEqual([expect.objectContaining({ title: "Generated title" })]);
  });

  it("takes a child's parent from the placement in local state, not from the parent's activity", () => {
    // A live shell carries no activities. The relation the waiting indicator needs is the
    // placement the server route hydrated into local state.
    const result = syncLiveThreadMetadataToLocalState({
      threads: [
        makeProjectThread({ id: "thread-parent", projectId: "stored-project" }),
        makeProjectThread({
          id: "thread-child",
          projectId: "stored-project",
          title: "Side Quest",
          parentThreadId: "thread-parent",
        }),
      ],
      storedProjects,
      liveProjects,
      liveThreads: [
        makeLiveThreadShell({ id: ThreadId.make("thread-parent"), projectId: LIVE_SAVED }),
        makeLiveThreadShell({
          id: ThreadId.make("thread-child"),
          projectId: LIVE_SAVED,
          title: "Side Quest",
          session: { status: "running" } as never,
          latestTurn: { state: "running" } as never,
        }),
      ],
    });

    expect(result).toContainEqual(
      expect.objectContaining({ id: "thread-child", parentThreadId: "thread-parent" }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({ id: "thread-parent", waitingOnChildren: true }),
    );
  });

  it("does not invent a placement for a child that local state has not hydrated yet", () => {
    const result = syncLiveThreadMetadataToLocalState({
      threads: [],
      storedProjects,
      liveProjects,
      liveThreads: [
        makeLiveThreadShell({ id: ThreadId.make("thread-parent"), projectId: LIVE_SAVED }),
        makeLiveThreadShell({
          id: ThreadId.make("thread-child"),
          projectId: LIVE_SAVED,
          title: "Side Quest",
        }),
      ],
    });

    const child = result.find((thread) => thread.id === "thread-child");
    expect(child).toBeDefined();
    expect(child?.parentThreadId).toBeUndefined();
  });
});
