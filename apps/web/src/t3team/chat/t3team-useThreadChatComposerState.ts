import { useCallback, useEffect, useMemo } from "react";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useThread } from "~/state/entities";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { prepareThreadContextAttachments } from "~/t3team/chat/t3team-prepareThreadContextAttachments";
import { launchPendingRecipeWorkflowTurn } from "~/t3team/chat/t3team-recipeWorkflowLaunch";
import { isThreadWaitingForRecipeInput } from "~/t3team/chat/t3team-recipeAwaitingInput";
import { useT3TeamOpenSenderThread } from "~/t3team/chat/t3team-useOpenSenderThread";
import { useAddToChatComposerDropTarget } from "~/t3team/hooks/t3team-useAddToChatComposerDropTarget";
import { useThreadStagedComposerAction } from "~/t3team/chat/t3team-useThreadStagedComposerAction";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

const EMPTY_ATTACHMENTS: T3TeamContextAttachment[] = [];

export function useThreadChatComposerState(input: {
  backend: BackendApi | null | undefined;
  projectId: string;
  threadId: string;
  ticketId?: string;
  turnToolContext: T3TeamTurnToolContext | undefined;
  kickoffPending: boolean | undefined;
  kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  hasServerLaunchActivity: boolean;
  embeddedMode?: boolean;
}) {
  const environmentId = usePrimaryEnvironmentId();
  const threadRef = useMemo(
    () => (environmentId ? scopeThreadRef(environmentId, input.threadId as never) : null),
    [environmentId, input.threadId],
  );
  const serverThread = useThread(threadRef);
  const waitingForRecipeInput = isThreadWaitingForRecipeInput(serverThread ?? undefined);

  const submitStagedAction = useThreadStagedComposerAction({
    projectId: input.projectId,
    ...(input.ticketId ? { ticketId: input.ticketId } : {}),
  });

  const pendingProjectContextCount = useT3TeamAddToChatStore(
    (state) => (state.pendingByProjectId[input.projectId] ?? []).length,
  );

  useEffect(() => {
    if (pendingProjectContextCount === 0) return;
    const pending = useT3TeamAddToChatStore.getState().drainProject(input.projectId);
    if (pending.length === 0) return;
    for (const item of pending) {
      useT3TeamAddToChatStore.getState().enqueueThreadAttachment(input.threadId, item.attachment);
    }
  }, [input.projectId, input.threadId, pendingProjectContextCount]);

  const contextAttachmentsOrUndefined = useT3TeamAddToChatStore(
    (state) => state.threadAttachmentsByThreadId[input.threadId],
  );
  const contextAttachments: T3TeamContextAttachment[] =
    contextAttachmentsOrUndefined ?? EMPTY_ATTACHMENTS;
  const removeThreadAttachment = useT3TeamAddToChatStore((state) => state.removeThreadAttachment);
  const clearThreadAttachmentState = useT3TeamAddToChatStore(
    (state) => state.clearThreadAttachments,
  );
  const composerDropTarget = useAddToChatComposerDropTarget();

  const removeContextAttachment = useCallback(
    (attachmentId: string) => removeThreadAttachment(input.threadId, attachmentId),
    [input.threadId, removeThreadAttachment],
  );
  const clearThreadAttachments = useCallback(
    () => clearThreadAttachmentState(input.threadId),
    [clearThreadAttachmentState, input.threadId],
  );
  const prepareComposerContextAttachments = useCallback(
    () => prepareThreadContextAttachments({ threadId: input.threadId, backend: input.backend }),
    [input.backend, input.threadId],
  );

  const submitRecipeCardAction = useCallback(
    async (action: { cardId: string; actionId: string; submit?: Record<string, unknown> }) => {
      if (!input.backend) {
        return;
      }

      await input.backend.submitRecipeCardAction({
        threadId: input.threadId,
        cardId: action.cardId,
        actionId: action.actionId,
        ...(action.submit ? { submit: action.submit } : {}),
      });
    },
    [input.backend, input.threadId],
  );

  const prepareTurnStart = useCallback(async () => {
    if (!input.backend) {
      return;
    }

    await input.backend.syncThreadToolContext({
      threadId: input.threadId,
      toolContext: input.turnToolContext ?? null,
    });
  }, [input.backend, input.threadId, input.turnToolContext]);

  // A decision-card click: ChatView renders the optimistic reply bubble (reusing the message id
  // the resolve route reconciles with) and hands the structured value here to post.
  const resolveWorkflowDecision = useCallback(
    async (decision: {
      threadId: string;
      messageId: string;
      text: string;
      value: unknown;
      correlationId: string;
    }) => {
      if (!input.backend) {
        return;
      }

      await input.backend.resolveWorkflowInput({
        threadId: decision.threadId,
        text: decision.text,
        messageId: decision.messageId,
        value: decision.value,
        correlationId: decision.correlationId,
      });
    },
    [input.backend],
  );

  const dispatchTurnStartOverride = useCallback(
    async (turnStart: {
      threadId: string;
      messageId: string;
      messageText: string;
      modelSelection: ModelSelection;
      titleSeed: string;
      runtimeMode: RuntimeMode;
      interactionMode: ProviderInteractionMode;
      createdAt: string;
      hasAttachments: boolean;
    }) => {
      if (!input.backend) {
        return false;
      }

      // Answering a workflow's pending askUser: post the reply as a real (visible) message via the
      // resolve route. The workflow-engine reactor resolves the parked user.input from that message
      // event — so the reply renders normally, no stray agent turn starts, and there is a single
      // resolution path.
      if (waitingForRecipeInput) {
        await input.backend.resolveWorkflowInput({
          threadId: turnStart.threadId,
          text: turnStart.messageText,
          messageId: turnStart.messageId,
        });
        // "resolved-input" tells ChatView this send posted a message with no turn lifecycle, so it
        // should clear its optimistic busy state itself (no turn event will arrive to clear it).
        return "resolved-input" as const;
      }

      // An action preselected from the page (the Description header's `Rewrite`) runs on THIS send —
      // that is the whole contract of staging, so it wins over a plain turn.
      const staged = submitStagedAction({
        backend: input.backend,
        threadId: turnStart.threadId,
        composerText: turnStart.messageText,
        modelSelection: turnStart.modelSelection,
        runtimeMode: turnStart.runtimeMode,
        interactionMode: turnStart.interactionMode,
      });
      if (staged) return staged;

      return launchPendingRecipeWorkflowTurn({
        backend: input.backend,
        threadId: turnStart.threadId,
        kickoffPending: input.kickoffPending,
        kickoffWorkflow: input.kickoffWorkflow,
        hasServerLaunchActivity: input.hasServerLaunchActivity,
        kickoffMessage: turnStart.messageText,
        titleSeed: turnStart.titleSeed,
        createdAt: turnStart.createdAt,
        modelSelection: turnStart.modelSelection,
        runtimeMode: turnStart.runtimeMode,
        interactionMode: turnStart.interactionMode,
        hasAttachments: turnStart.hasAttachments,
      });
    },
    [
      input.backend,
      input.hasServerLaunchActivity,
      input.kickoffPending,
      input.kickoffWorkflow,
      submitStagedAction,
      waitingForRecipeInput,
    ],
  );

  // Peer-thread opening for the actor-message card: a side-chat tab in this thread's right panel.
  const onOpenThread = useT3TeamOpenSenderThread(
    input.threadId,
    threadRef,
    input.embeddedMode ?? false,
  );

  return {
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
  };
}
