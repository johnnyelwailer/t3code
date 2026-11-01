import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useThreadShell } from "~/state/entities";
import { useBackend } from "~/t3team/backend/t3team-index";
import { prepareThreadContextAttachments } from "~/t3team/chat/t3team-prepareThreadContextAttachments";
import { ContextAttachmentStrip } from "~/t3team/components/t3team-ContextAttachmentChip";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import { retryContextCacheJobs } from "~/t3team/t3team-contextCacheJob";

const EMPTY_ATTACHMENTS: T3TeamContextAttachment[] = [];

/**
 * The one reader of the add-to-chat queue for a thread's composer, mounted by `ChatView` so a
 * thread on any environment shows what was dropped on it, whichever surface opened it. Every read
 * is a synchronous store read: nothing here, or on the send path it feeds, waits on a fetch.
 */
export function useT3TeamThreadContextQueue(input: {
  environmentId: EnvironmentId;
  threadId: string;
  enabled: boolean;
}) {
  const { environmentId, threadId, enabled } = input;
  const backend = useBackend();
  const sourceEnvironmentId = usePrimaryEnvironmentId();
  const threadRef = scopeThreadRef(environmentId, threadId as never);
  const projectId = useThreadShell(enabled ? threadRef : null)?.projectId ?? null;

  const pendingProjectContextCount = useT3TeamAddToChatStore((state) =>
    projectId === null ? 0 : (state.pendingByProjectId[projectId] ?? []).length,
  );
  // Context dropped with no thread to take it waits on the project; the next composer takes it.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- hands project-queued context to this thread's queue, both external stores the composer reads; not derivable from props
  useEffect(() => {
    if (projectId === null || pendingProjectContextCount === 0) return;
    const store = useT3TeamAddToChatStore.getState();
    for (const item of store.drainProject(projectId)) {
      store.enqueueThreadAttachment(threadId, item.attachment);
    }
  }, [projectId, threadId, pendingProjectContextCount]);

  // A cached-copy write that failed, or never started, runs again when the composer mounts.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts background writes that outlive renders and feed the draft chip; nothing here is derivable from props
  useEffect(() => {
    if (enabled) retryContextCacheJobs(threadId, { sourceEnvironmentId, backend });
  }, [enabled, threadId, sourceEnvironmentId, backend]);

  const attachments =
    useT3TeamAddToChatStore((state) => state.threadAttachmentsByThreadId[threadId]) ??
    EMPTY_ATTACHMENTS;
  const removeThreadAttachment = useT3TeamAddToChatStore((state) => state.removeThreadAttachment);
  const clearThreadAttachments = useT3TeamAddToChatStore((state) => state.clearThreadAttachments);
  const onRemove = (attachmentId: string) => removeThreadAttachment(threadId, attachmentId);
  const onConsumed = () => clearThreadAttachments(threadId);
  const prepare = () => prepareThreadContextAttachments({ threadId, backend });

  return {
    attachments,
    prepare,
    onConsumed,
    strip: <ContextAttachmentStrip attachments={attachments} onRemove={onRemove} />,
  };
}
