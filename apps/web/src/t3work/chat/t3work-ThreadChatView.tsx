import { useEffect, useMemo } from "react";
import { scopeThreadRef } from "@t3tools/client-runtime";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import { useShallow } from "zustand/react/shallow";
import ChatView from "~/components/ChatView";
import { usePrimaryEnvironmentId } from "~/environments/primary";
import { selectProjectsAcrossEnvironments, useStore } from "~/store";
import { createThreadSelectorByRef } from "~/storeSelectors";
import { useBackend } from "~/t3work/backend/t3work-index";
import { ContextAttachmentStrip } from "~/t3work/components/t3work-ContextAttachmentChip";
import { useThreadBootstrap } from "~/t3work/chat/t3work-useThreadBootstrap";
import { resolveCanonicalProjectIdForWorkspaceRoot } from "~/t3work/hooks/t3work-threadBridge";
import { useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";

const EMPTY_ATTACHMENTS: T3WorkContextAttachment[] = [];

export interface ThreadChatViewProps {
  threadId: string;
  projectId: string;
  projectTitle: string;
  projectWorkspaceRoot?: string;
  title: string;
  onBack?: () => void;
  hideHeader?: boolean;
  initialUserMessage?: string;
  initialModelSelection?: ModelSelection;
  initialRuntimeMode?: RuntimeMode;
  initialInteractionMode?: ProviderInteractionMode;
  onInitialUserMessageSent?: () => void;
}

export function ThreadChatView({
  threadId,
  projectId,
  projectTitle,
  projectWorkspaceRoot,
  title,
  initialUserMessage,
  initialModelSelection,
  initialRuntimeMode,
  initialInteractionMode,
  onInitialUserMessageSent,
}: ThreadChatViewProps) {
  const backend = useBackend();
  const environmentId = usePrimaryEnvironmentId();
  const liveProjects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const canonicalProjectId = useMemo(
    () => resolveCanonicalProjectIdForWorkspaceRoot(projectWorkspaceRoot, projectId, liveProjects),
    [liveProjects, projectId, projectWorkspaceRoot],
  );
  const threadRef = useMemo(
    () => (environmentId ? scopeThreadRef(environmentId, threadId as never) : null),
    [environmentId, threadId],
  );
  const serverThread = useStore(useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]));

  useThreadBootstrap({
    backend,
    environmentId,
    threadId,
    projectTitle,
    projectWorkspaceRoot,
    canonicalProjectId,
    title,
    initialUserMessage,
    initialModelSelection,
    initialRuntimeMode,
    initialInteractionMode,
    onInitialUserMessageSent,
    serverThread,
  });

  const pendingProjectContextCount = useT3WorkAddToChatStore(
    (state) => (state.pendingByProjectId[projectId] ?? []).length,
  );

  useEffect(() => {
    if (pendingProjectContextCount === 0) {
      return;
    }
    const pending = useT3WorkAddToChatStore.getState().drainProject(projectId);
    if (pending.length === 0) {
      return;
    }
    for (const item of pending) {
      useT3WorkAddToChatStore.getState().enqueueThreadAttachment(threadId, item.attachment);
    }
  }, [pendingProjectContextCount, projectId, threadId]);

  const contextAttachmentsOrUndefined = useT3WorkAddToChatStore(
    (state) => state.threadAttachmentsByThreadId[threadId],
  );
  const contextAttachments: T3WorkContextAttachment[] =
    contextAttachmentsOrUndefined ?? EMPTY_ATTACHMENTS;
  const removeContextAttachment = useT3WorkAddToChatStore((state) => state.removeThreadAttachment);
  const clearThreadAttachments = useT3WorkAddToChatStore((state) => state.clearThreadAttachments);

  const contextAttachmentSlot =
    contextAttachments.length > 0 ? (
      <ContextAttachmentStrip
        attachments={contextAttachments}
        onRemove={(id) => removeContextAttachment(threadId, id)}
      />
    ) : null;

  if (!environmentId) {
    return <div className="flex min-h-0 flex-1 bg-background" />;
  }

  return (
    <ChatView
      environmentId={environmentId}
      threadId={threadId as never}
      routeKind="server"
      composerContextAttachmentSlot={contextAttachmentSlot}
      composerContextAttachments={contextAttachments}
      onComposerContextAttachmentsConsumed={() => clearThreadAttachments(threadId)}
    />
  );
}
