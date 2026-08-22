import type { EnvironmentId } from "@t3tools/contracts";
import ChatView from "~/components/ChatView";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { ThreadPendingChat } from "~/t3team/chat/t3team-threadPendingChat";
import type { ThreadBootstrapStatus } from "~/t3team/chat/t3team-useThreadBootstrap";
import { useThreadChatComposerState } from "~/t3team/chat/t3team-useThreadChatComposerState";
import { ThreadKickoffPlaceholder } from "~/t3team/chat/t3team-threadKickoffPlaceholder";
import { T3TeamThreadComposerAccessory } from "~/t3team/chat/t3team-ThreadComposerAccessory";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";
import type { ChatMessage } from "~/types";

type ThreadChatComposerState = ReturnType<typeof useThreadChatComposerState>;

export interface ThreadChatViewBodyProps {
  /** Covers the composer when an external Codex/Claude session still owns this thread. */
  composerReadOnlyOverlay?: React.ReactNode;
  environmentId: EnvironmentId;
  threadId: string;
  projectId: string;
  /** Absent on threads that do not belong to a work item — nothing can be staged for those. */
  ticketId?: string | undefined;
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
  /** Fork the thread from a message (branch point); rendered next to each message's copy button. */
  onForkThread?: ((input: { readonly messageId: string }) => void | Promise<void>) | undefined;
  backend: BackendApi | null | undefined;
  bootstrapStatus: ThreadBootstrapStatus;
  retryThreadBootstrap: () => void;
  composerState: ThreadChatComposerState;
}

/** Presentational body for {@link ThreadChatView}: kickoff placeholder + ChatView/pending-chat split. */
export function ThreadChatViewBody({
  composerReadOnlyOverlay,
  environmentId,
  threadId,
  projectId,
  ticketId,
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
  onForkThread,
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
  // Handed over unconditionally: the accessory self-gates (attachment strip, staged action card,
  // staged note rows), so this must NOT re-derive "is anything staged" from attachments alone.
  const contextAttachmentSlot = (
    <T3TeamThreadComposerAccessory
      projectId={projectId}
      {...(ticketId ? { ticketId } : {})}
      attachments={contextAttachments}
      onRemoveAttachment={removeContextAttachment}
    />
  );
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
            composerContainerOverlay={
              composerReadOnlyOverlay ? (
                <>
                  {composerDropTarget.composerContainerOverlay}
                  {composerReadOnlyOverlay}
                </>
              ) : (
                composerDropTarget.composerContainerOverlay
              )
            }
            composerContextAttachments={contextAttachments}
            prepareComposerContextAttachments={prepareComposerContextAttachments}
            onComposerContextAttachmentsConsumed={clearThreadAttachments}
            onSubmitRecipeCardAction={submitRecipeCardAction}
            dispatchWorkflowDecision={resolveWorkflowDecision}
            {...(controlWorkflow ? { onControlWorkflow: controlWorkflow } : {})}
            onOpenThread={onOpenThread}
            {...(onForkThread ? { onForkThread } : {})}
          />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {kickoffPlaceholder}
          <ThreadPendingChat
            bootstrapStatus={bootstrapStatus}
            threadId={threadId}
            onRetryLaunch={retryThreadBootstrap}
          />
        </div>
      )}
    </div>
  );
}
