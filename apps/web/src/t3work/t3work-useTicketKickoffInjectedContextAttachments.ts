import { useEffect, useMemo, useState } from "react";

import { buildKickoffQueueKey, useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import { mergeContextAttachmentsById } from "~/t3work/t3work-contextAttachmentMerge";

export function useTicketKickoffInjectedContextAttachments(input: {
  projectId: string;
  ticketId: string;
}): readonly T3WorkContextAttachment[] {
  const [injectedContextAttachments, setInjectedContextAttachments] = useState<
    readonly T3WorkContextAttachment[]
  >([]);
  const kickoffQueueKey = useMemo(
    () => buildKickoffQueueKey(input.projectId, input.ticketId),
    [input.projectId, input.ticketId],
  );
  const pendingKickoffCount = useT3WorkAddToChatStore(
    (state) => (state.pendingByKickoffKey[kickoffQueueKey] ?? []).length,
  );

  useEffect(() => {
    if (pendingKickoffCount === 0) {
      return;
    }
    const drained = useT3WorkAddToChatStore
      .getState()
      .drainKickoff(input.projectId, input.ticketId);
    if (drained.length === 0) {
      return;
    }
    setInjectedContextAttachments((current) =>
      mergeContextAttachmentsById({
        current,
        incoming: drained.map((item) => item.attachment),
      }),
    );
  }, [input.projectId, input.ticketId, pendingKickoffCount]);

  return injectedContextAttachments;
}
