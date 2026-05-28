import { useCallback, useEffect } from "react";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import { prepareThreadContextAttachments } from "~/t3work/chat/t3work-prepareThreadContextAttachments";
import { launchPendingRecipeWorkflowTurn } from "~/t3work/chat/t3work-recipeWorkflowLaunch";
import { useAddToChatComposerDropTarget } from "~/t3work/hooks/t3work-useAddToChatComposerDropTarget";
import { useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import type { T3workTurnToolContext } from "~/t3work/t3work-threadToolContext";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

const EMPTY_ATTACHMENTS: T3WorkContextAttachment[] = [];

export function useThreadChatComposerState(input: {
  backend: BackendApi | null | undefined;
  projectId: string;
  threadId: string;
  turnToolContext: T3workTurnToolContext | undefined;
  kickoffPending: boolean | undefined;
  kickoffWorkflow: T3workKickoffWorkflow | undefined;
  hasServerLaunchActivity: boolean;
}) {
  const pendingProjectContextCount = useT3WorkAddToChatStore(
    (state) => (state.pendingByProjectId[input.projectId] ?? []).length,
  );

  useEffect(() => {
    if (pendingProjectContextCount === 0) return;
    const pending = useT3WorkAddToChatStore.getState().drainProject(input.projectId);
    if (pending.length === 0) return;
    for (const item of pending) {
      useT3WorkAddToChatStore.getState().enqueueThreadAttachment(input.threadId, item.attachment);
    }
  }, [input.projectId, input.threadId, pendingProjectContextCount]);

  const contextAttachmentsOrUndefined = useT3WorkAddToChatStore(
    (state) => state.threadAttachmentsByThreadId[input.threadId],
  );
  const contextAttachments: T3WorkContextAttachment[] =
    contextAttachmentsOrUndefined ?? EMPTY_ATTACHMENTS;
  const removeThreadAttachment = useT3WorkAddToChatStore((state) => state.removeThreadAttachment);
  const clearThreadAttachmentState = useT3WorkAddToChatStore(
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
    [input.backend, input.hasServerLaunchActivity, input.kickoffPending, input.kickoffWorkflow],
  );

  return {
    clearThreadAttachments,
    composerDropTarget,
    contextAttachments,
    dispatchTurnStartOverride,
    prepareComposerContextAttachments,
    prepareTurnStart,
    removeContextAttachment,
    submitRecipeCardAction,
  };
}
