/**
 * The outbox send paths for a t3team thread: enqueuing the composer's
 * would-be sends while the environment is unavailable, and the direct HTTP
 * actions (workflow answers, recipe card actions) that fall back to the
 * queue on the same condition. The queue itself and its drain live in
 * `~/t3team/outbox/`.
 *
 * Staged composer actions beat plain turns, mirroring the online dispatch
 * order: a preselected action is what the user chose the composer to run.
 */
import { useCallback } from "react";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import { buildKickoffQueueKey } from "~/t3team/t3team-addToChatStore";
import { isStagedComposerActionLaunchable } from "~/t3team/t3team-stagedComposerActionLaunch";
import { useT3TeamStagedComposerActionStore } from "~/t3team/t3team-stagedComposerActionStore";
import { makeT3TeamOutboxEntry } from "~/t3team/outbox/t3team-outboxModel";
import { enqueueT3TeamOutboxEntry } from "~/t3team/outbox/t3team-outboxStore";
import {
  useT3TeamWorkflowOutboxActions,
  type T3TeamOutboxBackend,
} from "~/t3team/outbox/t3team-useWorkflowOutboxActions";

export type EnqueueOfflineTurnStart = (turnStart: {
  readonly threadId: string;
  readonly messageId: string;
  readonly messageText: string;
  readonly modelSelection: ModelSelection | null;
  readonly titleSeed: string;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly createdAt: string;
  readonly hasAttachments: boolean;
}) => boolean | Promise<boolean>;

export function useT3TeamOutboxSend(input: {
  readonly backend: T3TeamOutboxBackend | null | undefined;
  readonly environmentId: string | null;
  readonly projectId: string;
  readonly threadId: string;
  readonly ticketId?: string;
  readonly serverThreadExists: boolean;
  readonly waitingForRecipeInput: boolean;
}) {
  const enqueueOfflineTurnStart: EnqueueOfflineTurnStart = useCallback(
    async (turnStart) => {
      if (
        !input.environmentId ||
        !input.serverThreadExists ||
        turnStart.hasAttachments ||
        turnStart.messageText.trim().length === 0
      ) {
        return false;
      }
      if (input.ticketId) {
        const target = { projectId: input.projectId, ticketId: input.ticketId };
        const staged =
          useT3TeamStagedComposerActionStore.getState().byKey[
            buildKickoffQueueKey(target.projectId, target.ticketId)
          ];
        if (staged && isStagedComposerActionLaunchable(staged)) {
          // The launch builder requires a concrete model selection; without
          // one the send keeps the stock offline toast instead of queueing.
          if (turnStart.modelSelection === null) return false;
          const stagedEnqueued = enqueueT3TeamOutboxEntry(
            makeT3TeamOutboxEntry(
              "staged-action",
              {
                action: staged,
                composerText: turnStart.messageText,
                modelSelection: turnStart.modelSelection,
                runtimeMode: turnStart.runtimeMode,
                interactionMode: turnStart.interactionMode,
              },
              input.environmentId,
              turnStart.threadId,
            ),
          );
          // Only consume the staged action when the queue actually stored it;
          // otherwise the user's text stays editable and the action is kept.
          if (stagedEnqueued) {
            useT3TeamStagedComposerActionStore.getState().clear(target);
          }
          return stagedEnqueued;
        }
      }
      const payload = input.waitingForRecipeInput
        ? makeT3TeamOutboxEntry(
            "workflow-answer",
            {
              messageId: turnStart.messageId,
              text: turnStart.messageText,
              value: undefined,
              correlationId: null,
            },
            input.environmentId,
            turnStart.threadId,
          )
        : makeT3TeamOutboxEntry(
            "turn-start",
            {
              messageId: turnStart.messageId,
              messageText: turnStart.messageText,
              modelSelection: turnStart.modelSelection,
              titleSeed: turnStart.titleSeed,
              runtimeMode: turnStart.runtimeMode,
              interactionMode: turnStart.interactionMode,
              createdAt: turnStart.createdAt,
            },
            input.environmentId,
            turnStart.threadId,
          );
      return enqueueT3TeamOutboxEntry(payload);
    },
    [
      input.environmentId,
      input.projectId,
      input.serverThreadExists,
      input.ticketId,
      input.threadId,
      input.waitingForRecipeInput,
    ],
  );

  const { resolveWorkflowDecision, submitRecipeCardAction } = useT3TeamWorkflowOutboxActions({
    backend: input.backend,
    environmentId: input.environmentId,
    threadId: input.threadId,
  });

  return { enqueueOfflineTurnStart, resolveWorkflowDecision, submitRecipeCardAction };
}
