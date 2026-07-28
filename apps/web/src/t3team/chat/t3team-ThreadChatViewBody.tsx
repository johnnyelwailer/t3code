import type { EnvironmentId } from "@t3tools/contracts";
import ChatView from "~/components/ChatView";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { ThreadPendingChat } from "~/t3team/chat/t3team-threadPendingChat";
import type { ThreadBootstrapStatus } from "~/t3team/chat/t3team-useThreadBootstrap";
import { useThreadChatComposerState } from "~/t3team/chat/t3team-useThreadChatComposerState";
import { ThreadKickoffPlaceholder } from "~/t3team/chat/t3team-threadKickoffPlaceholder";
import { ContextAttachmentStrip } from "~/t3team/components/t3team-ContextAttachmentChip";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";
import type { ChatMessage } from "~/types";

type ThreadChatComposerState = ReturnType<typeof useThreadChatComposerState>;

export interface ThreadChatViewBodyProps {
  environmentId: EnvironmentId;
  threadId: string;
  hasServerThread: boolean;
  showKickoffPlaceholder: boolean;
  kickoffMessage: string | undefined;
  kickoffPending: boolean | undefined;
  kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  kickoffHistoryMessage: ChatMessage | undefined;
  onBack: (() => void) | undefined;
  titleBarControlsAccessory: React.ReactNode | undefined;
  hideHeader: boolean;
  embeddedMode: boolean;
  backend: BackendApi | null | undefined;
  bootstrapStatus: ThreadBootstrapStatus;
  retryThreadBootstrap: () => void;
  composerState: ThreadChatComposerState;
}

/** Presentational body for {@link ThreadChatView}: kickoff placeholder + ChatView/pending-chat split. */
export function ThreadChatViewBody({
  environmentId,
  threadId,
  hasServerThread,
  showKickoffPlaceholder,
  kickoffMessage,
  kickoffPending,
  kickoffWorkflow,
  kickoffHistoryMessage,
  onBack,
  titleBarControlsAccessory,
  hideHeader,
  embeddedMode,
  backend,
  bootstrapStatus,
  retryThreadBootstrap,
  composerState: {
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
  },
}: ThreadChatViewBodyProps) {
  const contextAttachmentSlot =
    contextAttachments.length > 0 ? (
      <ContextAttachmentStrip attachments={contextAttachments} onRemove={removeContextAttachment} />
    ) : null;
  const controlWorkflow = backend?.controlWorkflow
    ? ({ workflowRunId, action }: { workflowRunId: string; action: "pause" | "resume" | "stop" }) =>
        backend.controlWorkflow!({ threadId, workflowRunId, action })
    : undefined;

  const kickoffPlaceholder =
    showKickoffPlaceholder && kickoffMessage ? (
      <ThreadKickoffPlaceholder
        message={kickoffMessage}
        hasServerThread={hasServerThread}
        {...(kickoffPending !== undefined ? { kickoffPending } : {})}
        {...(kickoffWorkflow ? { workflow: kickoffWorkflow } : {})}
      />
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      {hasServerThread ? (
        <>
          {kickoffPlaceholder}
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
          {kickoffPlaceholder}
          <ThreadPendingChat bootstrapStatus={bootstrapStatus} onRetryLaunch={retryThreadBootstrap} />
        </div>
      )}
    </div>
  );
}
