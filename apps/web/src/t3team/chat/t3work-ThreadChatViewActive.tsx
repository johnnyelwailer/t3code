import type { EnvironmentId, ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import ChatView from "~/components/ChatView";
import { ThreadKickoffPlaceholder } from "~/t3work/chat/t3work-threadKickoffPlaceholder";
import type { ChatMessage } from "~/types";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";
import type { TurnStartOverrideResult } from "~/t3work/t3work-chatViewExtensions";
import type { ReactNode } from "react";

export function ThreadChatViewActive({
  environmentId,
  threadId,
  kickoffHistoryMessage,
  onBack,
  titleBarControlsAccessory,
  hideHeader,
  embeddedMode,
  showKickoffPlaceholder,
  kickoffMessage,
  hasServerThread,
  kickoffPending,
  kickoffWorkflow,
  prepareTurnStart,
  dispatchTurnStartOverride,
  contextAttachmentSlot,
  composerDropTarget,
  contextAttachments,
  prepareComposerContextAttachments,
  clearThreadAttachments,
  submitRecipeCardAction,
  resolveWorkflowDecision,
}: {
  environmentId: EnvironmentId;
  threadId: string;
  kickoffHistoryMessage?: ChatMessage;
  onBack?: () => void;
  titleBarControlsAccessory?: ReactNode;
  hideHeader: boolean;
  embeddedMode: boolean;
  showKickoffPlaceholder: boolean;
  kickoffMessage?: string;
  hasServerThread: boolean;
  kickoffPending?: boolean;
  kickoffWorkflow?: T3workKickoffWorkflow;
  prepareTurnStart: () => void | Promise<void>;
  dispatchTurnStartOverride: (turnStart: {
    readonly threadId: string;
    readonly messageId: string;
    readonly messageText: string;
    readonly modelSelection: ModelSelection;
    readonly titleSeed: string;
    readonly runtimeMode: RuntimeMode;
    readonly interactionMode: ProviderInteractionMode;
    readonly createdAt: string;
    readonly hasAttachments: boolean;
  }) => Promise<TurnStartOverrideResult>;
  contextAttachmentSlot: ReactNode;
  composerDropTarget: {
    composerContainerProps: React.HTMLAttributes<HTMLDivElement>;
    composerContainerOverlay: ReactNode;
  };
  contextAttachments: ReadonlyArray<T3WorkContextAttachment>;
  prepareComposerContextAttachments: () => Promise<ReadonlyArray<T3WorkContextAttachment>>;
  clearThreadAttachments: () => void;
  submitRecipeCardAction: (action: {
    readonly cardId: string;
    readonly actionId: string;
    readonly submit?: Record<string, unknown>;
  }) => void | Promise<void>;
  resolveWorkflowDecision: (decision: {
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly value: unknown;
    readonly correlationId: string;
  }) => void | Promise<void>;
}) {
  return (
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
      />
    </>
  );
}
