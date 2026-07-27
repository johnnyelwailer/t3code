import { useEffect } from "react";

import { threadHasStarted } from "~/components/ChatView.logic";
import { finalizePromotedDraftThreadByRef } from "~/composerDraftStore";
import { useThread, useThreadRefs } from "~/state/entities";

/**
 * Retires the draft record behind a thread once that thread really exists.
 *
 * Upstream finalizes a promoted draft on its own server-thread route
 * (`_chat.$environmentId.$threadId`). The Team shell routes promoted threads to
 * `/t3team/projects/$projectId/threads/$threadId` instead, so without this the
 * draft session and its persisted composer state (draft text, attachments,
 * model selection) would stay in local storage forever and
 * `draftThreadsByThreadKey` would grow on every new thread.
 *
 * It lives on the destination route rather than in the draft pane on purpose:
 * arriving at the thread is the one point every promotion path goes through,
 * including a reload or a deep link after the pane already unmounted.
 */
export function useFinalizePromotedDraft(threadId: string | null): void {
  const threadRefs = useThreadRefs();
  const threadRef = threadId
    ? (threadRefs.find((candidate) => candidate.threadId === threadId) ?? null)
    : null;
  const serverThread = useThread(threadRef);
  const serverThreadStarted = threadHasStarted(serverThread);

  useEffect(() => {
    if (!threadRef || !serverThreadStarted) {
      return;
    }

    finalizePromotedDraftThreadByRef(threadRef);
  }, [serverThreadStarted, threadRef]);
}
