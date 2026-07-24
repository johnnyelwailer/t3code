import { useEffect, useMemo, useState } from "react";

import { buildKickoffQueueKey, useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import { mergeContextAttachmentsById } from "~/t3team/t3team-contextAttachmentMerge";

export function useTicketKickoffInjectedContextAttachments(input: {
  projectId: string;
  ticketId: string;
}): readonly T3TeamContextAttachment[] {
  const [injectedContextAttachments, setInjectedContextAttachments] = useState<
    readonly T3TeamContextAttachment[]
  >([]);
  const kickoffQueueKey = useMemo(
    () => buildKickoffQueueKey(input.projectId, input.ticketId),
    [input.projectId, input.ticketId],
  );
  const pendingKickoffCount = useT3TeamAddToChatStore(
    (state) => (state.pendingByKickoffKey[kickoffQueueKey] ?? []).length,
  );

  useEffect(() => {
    if (pendingKickoffCount === 0) {
      return;
    }
    const drained = useT3TeamAddToChatStore
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
