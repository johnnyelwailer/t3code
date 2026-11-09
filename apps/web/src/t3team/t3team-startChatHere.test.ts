import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import {
  readQueuedWorkItemContextSyncRequests,
  resetWorkItemContextSyncQueueForTests,
} from "~/t3team/hooks/t3team-useWorkItemContextSyncQueue";

import { startChatHere, type StartChatHereDeps } from "./t3team-startChatHere";

const environmentId = EnvironmentId.make("env-1");
const newThreadRef = scopeThreadRef(environmentId, ThreadId.make("thread-new"));

function deps(overrides: Partial<StartChatHereDeps> = {}) {
  const panelAtNavigation: string[] = [];
  const openFullThread = vi.fn(() => {
    panelAtNavigation.push(
      ...selectThreadRightPanelState(
        useRightPanelStore.getState().byThreadKey,
        newThreadRef,
      ).surfaces.map((surface) => surface.id),
    );
  });
  const createThread = vi.fn(() => ({ id: "thread-new" }));
  const value: StartChatHereDeps = {
    environmentId,
    resolveProjectId: (projectId) => (projectId === "live-p1" ? "p1" : projectId),
    createThread,
    openFullThread,
    ...overrides,
  };
  return { value, createThread, openFullThread, panelAtNavigation };
}

beforeEach(() => {
  resetWorkItemContextSyncQueueForTests();
  useRightPanelStore.setState({ byThreadKey: {}, userActionRevisionByThreadKey: {} });
});

describe("startChatHere", () => {
  it("opens the source view beside the new thread before navigating to it", () => {
    const { value, createThread, openFullThread, panelAtNavigation } = deps();
    expect(startChatHere(value, { kind: "my-work", projectId: "live-p1" })).toBe("thread-new");
    expect(createThread).toHaveBeenCalledWith("p1", { viewMode: "thread" });
    expect(openFullThread).toHaveBeenCalledWith("p1", "thread-new");
    expect(panelAtNavigation).toEqual(["view:my-work:p1"]);
    expect(readQueuedWorkItemContextSyncRequests()).toEqual([]);
  });

  it("binds a work-item thread to its ticket and queues the ticket as its context", () => {
    const { value, createThread, panelAtNavigation } = deps();
    startChatHere(value, {
      kind: "work-item",
      projectId: "p1",
      ticketId: "t-1",
      displayId: "NX-4711",
      title: "Rechnungsfreigabe",
    });
    expect(createThread).toHaveBeenCalledWith("p1", {
      viewMode: "thread",
      ticketId: "t-1",
      ticketDisplayId: "NX-4711",
    });
    expect(panelAtNavigation).toEqual(["view:work-item:p1:t-1"]);
    expect(readQueuedWorkItemContextSyncRequests()).toEqual([
      { id: "thread-new", projectId: "p1", ticketKey: "NX-4711", threadId: "thread-new" },
    ]);
  });

  it("still opens the thread when no environment is known yet, without a tab", () => {
    const { value, openFullThread } = deps({ environmentId: null });
    startChatHere(value, { kind: "my-work", projectId: "p1" });
    expect(openFullThread).toHaveBeenCalledOnce();
    expect(useRightPanelStore.getState().byThreadKey).toEqual({});
  });
});
