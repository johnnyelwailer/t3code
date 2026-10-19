/**
 * Shows a draft's queued cloud send as its optimistic user bubble. The record is persisted, so
 * the bubble is derived from it on every mount (after navigating back or a restart) instead of
 * living only in the composer's React state.
 */
import { MessageId } from "@t3tools/contracts";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import type { ChatMessage } from "~/types";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { useDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";

function cloudQueuedSendChatMessage(queued: CloudQueuedSend): ChatMessage {
  return {
    id: MessageId.make(queued.messageId),
    role: "user",
    text: queued.messageText,
    runId: null,
    createdAt: queued.createdAt,
    updatedAt: queued.createdAt,
    streaming: false,
    inputIntent: "queued_turn",
  };
}

export function useCloudQueuedSendOptimisticMessage(input: {
  readonly draftId: string | null;
  readonly setOptimisticUserMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}): CloudQueuedSend | null {
  const queued = useDraftCloudQueuedSend(input.draftId);
  const shownRef = useRef<string | null>(null);
  const { draftId, setOptimisticUserMessages } = input;

  useEffect(() => {
    if (queued !== null) {
      shownRef.current = queued.messageId;
      setOptimisticUserMessages((existing) =>
        existing.some((message) => message.id === queued.messageId)
          ? existing
          : [...existing, cloudQueuedSendChatMessage(queued)],
      );
      return;
    }
    const shown = shownRef.current;
    if (shown === null) return;
    shownRef.current = null;
    // Delivered: the draft was promoted and the server message replaces the bubble by id.
    // Cancelled: the text is back in the composer, so the bubble goes.
    const session =
      draftId === null
        ? null
        : useComposerDraftStore.getState().getDraftSession(DraftId.make(draftId));
    if (session?.promotedTo) return;
    setOptimisticUserMessages((existing) => existing.filter((message) => message.id !== shown));
  }, [draftId, queued, setOptimisticUserMessages]);

  return queued;
}
