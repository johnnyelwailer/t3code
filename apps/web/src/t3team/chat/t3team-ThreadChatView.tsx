import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import ChatView from "~/components/ChatView";
import { useBackend } from "~/t3team/backend/t3team-index";
import { ThreadPendingChat } from "~/t3team/chat/t3team-threadPendingChat";
import { useThreadBootstrap } from "~/t3team/chat/t3team-useThreadBootstrap";
import { useThreadChatComposerState } from "~/t3team/chat/t3team-useThreadChatComposerState";
import { useThreadChatDebug } from "~/t3team/chat/t3team-useThreadChatDebug";
import { useThreadChatServerState } from "~/t3team/chat/t3team-useThreadChatServerState";
import { useThreadChatTurnToolContext } from "~/t3team/chat/t3team-useThreadChatTurnToolContext";
import { ThreadKickoffPlaceholder } from "~/t3team/chat/t3team-threadKickoffPlaceholder";
import { ContextAttachmentStrip } from "~/t3team/components/t3team-ContextAttachmentChip";
import type { T3TeamKickoffWorkflow, T3TeamThreadToolId } from "~/t3team/t3team-types";

export interface ThreadChatViewProps {
  threadId: string;
  projectId: string;
  projectTitle: string;
  projectWorkspaceRoot?: string;
  title: string;
  onBack?: () => void;
  titleBarControlsAccessory?: React.ReactNode;
  hideHeader?: boolean;
  embeddedMode?: boolean;
  kickoffMessage?: string;
  kickoffPending?: boolean;
  kickoffWorkflow?: T3TeamKickoffWorkflow;
  initialUserMessage?: string;
  initialModelSelection?: ModelSelection;
  initialRuntimeMode?: RuntimeMode;
  initialInteractionMode?: ProviderInteractionMode;
  ticketId?: string;
  ticketDisplayId?: string;
  selectedToolIds?: ReadonlyArray<T3TeamThreadToolId>;
  onInitialUserMessageSent?: () => void;
}

export function ThreadChatView({
  threadId,
  projectId,
  projectTitle,
  projectWorkspaceRoot,
  title,
  onBack,
  titleBarControlsAccessory,
  hideHeader = false,
  embeddedMode = false,
  kickoffMessage,
  kickoffPending,
  kickoffWorkflow,
  initialUserMessage,
  initialModelSelection,
  initialRuntimeMode,
  initialInteractionMode,
  ticketId,
  ticketDisplayId,
  selectedToolIds,
  onInitialUserMessageSent,
}: ThreadChatViewProps) {
  const backend = useBackend();
  const {
    canonicalProjectId,
    environmentId,
    hasServerLaunchActivity,
    hasServerThread,
    kickoffHistoryMessage,
    projectExists,
    serverThread,
    serverThreadSummary,
    showKickoffPlaceholder,
  } = useThreadChatServerState({
    threadId,
    projectId,
    projectWorkspaceRoot,
    kickoffMessage,
    kickoffPending,
    kickoffWorkflow,
  });
  const turnToolContext = useThreadChatTurnToolContext({
    embeddedMode,
    projectId,
    projectTitle,
    projectWorkspaceRoot,
    kickoffMessage,
    kickoffPending,
    kickoffWorkflow,
    selectedToolIds,
    threadId,
    ticketId,
    ticketDisplayId,
    title,
  });

  const { bootstrapStatus, retryThreadBootstrap } = useThreadBootstrap({
    backend,
    environmentId,
    threadId,
    projectTitle,
    projectWorkspaceRoot,
    canonicalProjectId,
    projectExists,
    title,
    initialUserMessage,
    initialModelSelection,
    initialRuntimeMode,
    initialInteractionMode,
    kickoffWorkflow,
    initialToolContext: turnToolContext,
    onInitialUserMessageSent,
    serverThread,
  });

  useThreadChatDebug({
    environmentId,
    projectId,
    threadId,
    projectWorkspaceRoot,
    canonicalProjectId,
    projectExists,
    hasInitialUserMessage: Boolean(initialUserMessage),
    hasServerThread,
    serverThreadSummary,
  });
  const {
    clearThreadAttachments,
    composerDropTarget,
    contextAttachments,
    dispatchTurnStartOverride,
    prepareComposerContextAttachments,
    prepareTurnStart,
    removeContextAttachment,
    resolveWorkflowDecision,
    submitRecipeCardAction,
    onOpenThread,
  } = useThreadChatComposerState({
    backend,
    projectId,
    threadId,
    ...(ticketId ? { ticketId } : {}),
    turnToolContext,
    kickoffPending,
    kickoffWorkflow,
    hasServerLaunchActivity,
  });

  const contextAttachmentSlot =
    contextAttachments.length > 0 ? (
      <ContextAttachmentStrip attachments={contextAttachments} onRemove={removeContextAttachment} />
    ) : null;
  const controlWorkflow = backend?.controlWorkflow
    ? ({ workflowRunId, action }: { workflowRunId: string; action: "pause" | "resume" | "stop" }) =>
        backend.controlWorkflow!({ threadId, workflowRunId, action })
    : undefined;

  if (!environmentId) {
    return <div className="flex h-full min-h-0 flex-1 bg-background" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      {hasServerThread ? (
        <>
          {showKickoffPlaceholder && kickoffMessage ? (
            <ThreadKickoffPlaceholder
              message={kickoffMessage}
              hasServerThread={hasServerThread}
              {...(kickoffPending !== undefined ? { kickoffPending } : {})}
              {...(kickoffWorkflow ? { workflow: kickoffWorkflow } : {})}
            />
          ) : null}
          <ChatView
            environmentId={environmentId}
            threadId={threadId as never}
            routeKind="server"
            {...(kickoffHistoryMessage ? { syntheticMessages: [kickoffHistoryMessage] } : {})}
            {...(onBack ? { onBack } : {})}
            {...(titleBarControlsAccessory ? { titleBarControlsAccessory } : {})}
            hideHeader={hideHeader || embeddedMode}
            hideBranchToolbar={embeddedMode}
            minimalComposer={embeddedMode}
            beforeDispatchTurnStart={prepareTurnStart}
            dispatchTurnStartOverride={dispatchTurnStartOverride}
            composerContextAttachmentSlot={contextAttachmentSlot}
            composerContainerProps={composerDropTarget.composerContainerProps}
            composerContainerOverlay={composerDropTarget.composerContainerOverlay}
            composerContextAttachments={contextAttachments}
            prepareComposerContextAttachments={prepareComposerContextAttachments}
            onComposerContextAttachmentsConsumed={clearThreadAttachments}
            onSubmitRecipeCardAction={submitRecipeCardAction}
            dispatchWorkflowDecision={resolveWorkflowDecision}
            {...(controlWorkflow ? { onControlWorkflow: controlWorkflow } : {})}
            onOpenThread={onOpenThread}
          />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {showKickoffPlaceholder && kickoffMessage ? (
            <ThreadKickoffPlaceholder
              message={kickoffMessage}
              hasServerThread={hasServerThread}
              {...(kickoffPending !== undefined ? { kickoffPending } : {})}
              {...(kickoffWorkflow ? { workflow: kickoffWorkflow } : {})}
            />
          ) : null}
          <ThreadPendingChat
            bootstrapStatus={bootstrapStatus}
            onRetryLaunch={retryThreadBootstrap}
          />
        </div>
      )}
    </div>
  );
}
