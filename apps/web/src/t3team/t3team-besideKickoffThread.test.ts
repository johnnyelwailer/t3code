import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { settleBesideKickoffThread } from "~/t3team/t3team-besideKickoffThread";
import {
  digestAsideChatThreadId,
  useDigestChatThreadStore,
} from "~/t3team/t3team-digestChatThread";

const thread = {
  projectId: "project-1",
  ticketId: "ticket-9",
  threadId: "thread-new",
} as const;

describe("settleBesideKickoffThread", () => {
  beforeEach(() => {
    useDigestChatThreadStore.setState({ projectId: null, ticketId: null, threadId: null });
  });

  it("keeps all-my-work open and makes the new thread the digest chat", () => {
    const setView = vi.fn();

    settleBesideKickoffThread({
      activeView: { type: "all-my-work" },
      ...thread,
      setView,
    });

    expect(setView).toHaveBeenCalledWith({ type: "all-my-work" });
    expect(useDigestChatThreadStore.getState()).toEqual(thread);
    expect(
      digestAsideChatThreadId({
        threads: [
          {
            id: "thread-old",
            ticketId: "ticket-9",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "thread-new",
            ticketId: "ticket-9",
            createdAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        ticketId: "ticket-9",
        pinnedThreadId: useDigestChatThreadStore.getState().threadId,
      }),
    ).toBe("thread-new");
  });

  it("restores the project dashboard instead of leaving the discarded ticket view", () => {
    const setView = vi.fn();

    settleBesideKickoffThread({
      activeView: { type: "dashboard", projectId: "project-1", embeddedThreadId: "thread-kept" },
      ...thread,
      setView,
    });

    expect(setView).toHaveBeenCalledWith({
      type: "dashboard",
      projectId: "project-1",
      embeddedThreadId: "thread-kept",
    });
  });

  it("falls back to the ticket's newest live thread when nothing was pinned", () => {
    expect(
      digestAsideChatThreadId({
        threads: [
          {
            id: "thread-old",
            ticketId: "ticket-9",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "thread-new",
            ticketId: "ticket-9",
            ticketDisplayId: "PROJ-9",
            createdAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        ticketId: "PROJ-9",
        pinnedThreadId: null,
      }),
    ).toBe("thread-new");
  });
});
