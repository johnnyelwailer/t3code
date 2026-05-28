import { useEffect, useState } from "react";

import { useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import { mergeContextAttachmentsById } from "~/t3work/t3work-contextAttachmentMerge";

export function useProjectDashboardInjectedContextAttachments(projectId: string) {
  const [injectedContextAttachments, setInjectedContextAttachments] = useState<
    readonly T3WorkContextAttachment[]
  >([]);
  const [dismissedAttachmentIds, setDismissedAttachmentIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pendingProjectContextCount = useT3WorkAddToChatStore(
    (state) => (state.pendingByProjectId[projectId] ?? []).length,
  );

  useEffect(() => {
    if (pendingProjectContextCount === 0) {
      return;
    }

    const drained = useT3WorkAddToChatStore.getState().drainProject(projectId);
    if (drained.length === 0) {
      return;
    }

    setInjectedContextAttachments((current) =>
      mergeContextAttachmentsById({
        current,
        incoming: drained.map((item) => item.attachment),
        dismissedIds: dismissedAttachmentIds,
      }),
    );
  }, [dismissedAttachmentIds, pendingProjectContextCount, projectId]);

  const removeContextAttachment = (id: string) => {
    setInjectedContextAttachments((current) =>
      current.filter((attachment) => attachment.id !== id),
    );
    setDismissedAttachmentIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const clearInjectedContextAttachments = () => {
    setInjectedContextAttachments([]);
    setDismissedAttachmentIds(new Set());
  };

  return {
    injectedContextAttachments,
    removeContextAttachment,
    clearInjectedContextAttachments,
  };
}
