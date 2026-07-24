import { type EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { Thread } from "~/types";
import { syncLiveThreadMetadataToLocalState } from "./t3team-threadBridge";
import {
  makeLiveProject,
  makeProjectThread,
  makeStoredProject,
} from "./t3team-threadBridge.testSupport";

function makeLiveThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-parent",
    projectId: ProjectId.make("live-saved"),
    title: "Generated title",
    messages: [],
    activities: [],
    latestTurn: null,
    archivedAt: null,
    error: null,
    session: null,
    createdAt: "2026-05-22T09:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
    environmentId: "env-local" as EnvironmentId,
    defaultModelSelection: null,
    ...overrides,
  } as unknown as Thread;
}

const storedProjects = [makeStoredProject()];
const liveProjects = [
  makeLiveProject({ id: ProjectId.make("live-saved"), workspaceRoot: "/workspace/saved" }),
];

describe("syncLiveThreadMetadataToLocalState", () => {
  it("syncs generated titles for ordinary root threads", () => {
    const result = syncLiveThreadMetadataToLocalState({
      threads: [makeProjectThread({ id: "thread-parent", title: "New thread" })],
      storedProjects,
      liveProjects,
      liveThreads: [makeLiveThread()],
    });

    expect(result).toEqual([expect.objectContaining({ title: "Generated title" })]);
  });

  it("infers legacy child placement from the parent's handoff activity", () => {
    const parent = makeLiveThread({
      activities: [
        {
          id: "handoff-started",
          tone: "info",
          kind: "t3team.handoff.started",
          summary: "Started child session Side Quest",
          payload: { childThreadId: "thread-child", childTitle: "Side Quest" },
          turnId: null,
          createdAt: "2026-05-22T09:01:00.000Z",
        },
      ],
    } as never);
    const child = makeLiveThread({
      id: "thread-child",
      title: "Side Quest",
      activities: [
        {
          id: "handoff-created",
          tone: "info",
          kind: "t3team.handoff.created",
          summary: "Created from Generated title",
          payload: { childThreadId: "thread-child", childTitle: "Side Quest" },
          turnId: null,
          createdAt: "2026-05-22T09:01:00.000Z",
        },
      ],
    } as never);

    const result = syncLiveThreadMetadataToLocalState({
      threads: [],
      storedProjects,
      liveProjects,
      liveThreads: [parent, child],
    });

    expect(result).toContainEqual(
      expect.objectContaining({ id: "thread-child", parentThreadId: "thread-parent" }),
    );
  });
});
