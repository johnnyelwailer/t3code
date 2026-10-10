import { create } from "zustand";

import { latestLiveTicketThreadId } from "~/t3team/t3team-ticketLookup";
import type { ProjectThread } from "~/t3team/t3team-types";

type DigestChatThreadState = {
  readonly projectId: string | null;
  readonly ticketId: string | null;
  readonly threadId: string | null;
};

/**
 * The thread a My Work side-panel kickoff just opened. The route cannot carry it:
 * all-my-work has no embedded thread, and a ticket view written by `createThread`
 * is discarded while that route is active. The digest Chat tab reads this instead.
 */
export const useDigestChatThreadStore = create<DigestChatThreadState>(() => ({
  projectId: null,
  ticketId: null,
  threadId: null,
}));

export function openDigestChatThread(input: {
  readonly projectId: string;
  readonly ticketId: string;
  readonly threadId: string;
}) {
  useDigestChatThreadStore.setState(input);
}

export function digestAsideChatThreadId(input: {
  readonly threads: ReadonlyArray<
    Pick<ProjectThread, "id" | "ticketId" | "ticketDisplayId" | "createdAt" | "settled">
  >;
  readonly ticketId: string;
  readonly pinnedThreadId: string | null;
}): string | undefined {
  if (
    input.pinnedThreadId &&
    input.threads.some((thread) => thread.id === input.pinnedThreadId && thread.settled !== true)
  ) {
    return input.pinnedThreadId;
  }

  return latestLiveTicketThreadId(input.threads, input.ticketId);
}
