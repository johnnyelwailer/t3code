import { openDigestChatThread } from "~/t3team/t3team-digestChatThread";
import type { ViewState } from "~/t3team/t3team-types";

/**
 * Keep a side-panel kickoff on My Work and show the new thread in the digest Chat tab.
 *
 * Creating the thread also writes a ticket view. On My Work that view is discarded, so
 * restore the view the user is actually on. The Chat tab then selects the thread the
 * same way it selects any live ticket thread.
 */
export function settleBesideKickoffThread(input: {
  readonly activeView: ViewState | null;
  readonly projectId: string;
  readonly ticketId: string;
  readonly threadId: string;
  readonly setView: (view: ViewState) => void;
}): void {
  openDigestChatThread({
    projectId: input.projectId,
    ticketId: input.ticketId,
    threadId: input.threadId,
  });

  if (input.activeView?.type === "all-my-work") {
    input.setView({ type: "all-my-work" });
    return;
  }

  if (input.activeView?.type === "dashboard") {
    input.setView({
      type: "dashboard",
      projectId: input.activeView.projectId,
      ...(input.activeView.embeddedThreadId
        ? { embeddedThreadId: input.activeView.embeddedThreadId }
        : {}),
    });
  }
}
