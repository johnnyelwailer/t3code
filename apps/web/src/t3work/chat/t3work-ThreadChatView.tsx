import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { ComponentType } from "react";
import ChatView from "~/components/ChatView";
import { useBackend } from "~/t3work/backend/t3work-index";
import { ThreadPendingChat } from "~/t3work/chat/t3work-threadPendingChat";
import { useThreadBootstrap } from "~/t3work/chat/t3work-useThreadBootstrap";
import { useThreadChatComposerState } from "~/t3work/chat/t3work-useThreadChatComposerState";
import { useThreadChatDebug } from "~/t3work/chat/t3work-useThreadChatDebug";
import { useThreadChatServerState } from "~/t3work/chat/t3work-useThreadChatServerState";
import { useThreadChatTurnToolContext } from "~/t3work/chat/t3work-useThreadChatTurnToolContext";
import { ThreadKickoffPlaceholder } from "~/t3work/chat/t3work-threadKickoffPlaceholder";
import { ContextAttachmentStrip } from "~/t3work/components/t3work-ContextAttachmentChip";
import type { T3workKickoffWorkflow, T3workThreadToolId } from "~/t3work/t3work-types";

const T3workChatView = ChatView as ComponentType<Record<string, unknown>>;

export interface ThreadChatViewProps {
  threadId: string;
  projectId: string;
  projectTitle: string;
  projectWorkspaceRoot?: string;
  title: string;
  onBack?: () => void;
  headerAccessory?: React.ReactNode;
  hideHeader?: boolean;
  embeddedMode?: boolean;
  kickoffMessage?: string;
  kickoffPending?: boolean;
  kickoffWorkflow?: T3workKickoffWorkflow;
  initialUserMessage?: string;
  initialModelSelection?: ModelSelection;
  initialRuntimeMode?: RuntimeMode;
  initialInteractionMode?: ProviderInteractionMode;
  ticketId?: string;
  selectedToolIds?: ReadonlyArray<T3workThreadToolId>;
  onInitialUserMessageSent?: () => void;
}

export function ThreadChatView({
  threadId,
  projectId,
  projectTitle,
  projectWorkspaceRoot,
  title,
  onBack,
  headerAccessory,
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
    backend,
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
  } = useThreadChatComposerState({
    backend,
    projectId,
    threadId,
    turnToolContext,
    kickoffPending,
    kickoffWorkflow,
    hasServerLaunchActivity,
  });

  const contextAttachmentSlot =
    contextAttachments.length > 0 ? (
      <ContextAttachmentStrip attachments={contextAttachments} onRemove={removeContextAttachment} />
    ) : null;

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
          <T3workChatView
            environmentId={environmentId}
            threadId={threadId as never}
            routeKind="server"
            {...(kickoffHistoryMessage ? { syntheticMessages: [kickoffHistoryMessage] } : {})}
            {...(onBack ? { onBack } : {})}
            {...(headerAccessory ? { headerAccessory } : {})}
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
