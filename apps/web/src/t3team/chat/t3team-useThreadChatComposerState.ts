import { useCallback, useMemo } from "react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useThreadProjection, useThreadShell } from "~/state/entities";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { isThreadWaitingForRecipeInput } from "~/t3team/chat/t3team-recipeAwaitingInput";
import { useT3TeamOpenSenderThread } from "~/t3team/chat/t3team-useOpenSenderThread";
import { useAddToChatComposerDropTarget } from "~/t3team/hooks/t3team-useAddToChatComposerDropTarget";
import { useThreadStagedComposerAction } from "~/t3team/chat/t3team-useThreadStagedComposerAction";
import { useT3TeamOutboxSend } from "~/t3team/outbox/t3team-useOutboxSend";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";
import { syncThreadToolContextCached } from "./t3team-useThreadChatComposerState-turnContext";
import {
  dispatchTurnStart,
  type DispatchTurnStartInput,
} from "./t3team-useThreadChatComposerState-turnStart";

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
  const threadShell = useThreadShell(threadRef);
  const threadDetail = useThreadProjection(threadRef);
  const waitingForRecipeInput = isThreadWaitingForRecipeInput(threadDetail?.projection.messages);

  const submitStagedAction = useThreadStagedComposerAction({
    projectId: input.projectId,
    ...(input.ticketId ? { ticketId: input.ticketId } : {}),
  });

  const composerDropTarget = useAddToChatComposerDropTarget();

  const outboxSend = useT3TeamOutboxSend({
    backend: input.backend,
    environmentId,
    projectId: input.projectId,
    threadId: input.threadId,
    ...(input.ticketId ? { ticketId: input.ticketId } : {}),
    serverThreadExists: threadShell !== null || threadDetail !== null,
    waitingForRecipeInput,
  });

  const prepareTurnStart = useCallback(async () => {
    if (!input.backend) {
      return;
    }

    await syncThreadToolContextCached(input.backend, input.threadId, input.turnToolContext ?? null);
  }, [input.backend, input.threadId, input.turnToolContext]);

  const dispatchTurnStartOverride = useCallback(
    (turnStart: DispatchTurnStartInput) =>
      dispatchTurnStart(turnStart, {
        backend: input.backend,
        kickoffPending: input.kickoffPending,
        kickoffWorkflow: input.kickoffWorkflow,
        hasServerLaunchActivity: input.hasServerLaunchActivity,
        submitStagedAction,
        waitingForRecipeInput,
      }),
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
    composerDropTarget,
    dispatchTurnStartOverride,
    enqueueOfflineTurnStart: outboxSend.enqueueOfflineTurnStart,
    prepareTurnStart,
    resolveWorkflowDecision: outboxSend.resolveWorkflowDecision,
    submitRecipeCardAction: outboxSend.submitRecipeCardAction,
    onOpenThread,
  };
}
