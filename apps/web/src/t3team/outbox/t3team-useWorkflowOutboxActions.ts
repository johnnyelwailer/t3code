/**
 * Workflow answers and recipe-card actions for one thread: sent straight to the thread's server
 * while its environment is connected, queued in the durable outbox otherwise (the drain delivers
 * them on reconnect). Split from the composer's send paths so a thread view with no Team composer
 * (a cloud session's thread on `/$environmentId/$threadId`) can offer the same decision cards.
 */
import { useCallback, useRef } from "react";

import { toastManager } from "~/components/ui/toast";
import { useEnvironment } from "~/state/environments";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { makeT3TeamOutboxEntry } from "~/t3team/outbox/t3team-outboxModel";
import { enqueueT3TeamOutboxEntry } from "~/t3team/outbox/t3team-outboxStore";

/** What the outbox's workflow sends and its drain need from a backend. */
export type T3TeamOutboxBackend = Pick<
  BackendApi,
  "resolveWorkflowInput" | "submitRecipeCardAction"
> &
  Partial<Pick<BackendApi, "launchRecipeWorkflow">>;

/** A workflow/card action failed to queue durably; surface it instead of dropping it silently. */
function notifyOutboxPersistFailed(): void {
  toastManager.add({
    type: "warning",
    title: "Couldn't queue that yet",
    description: "The offline queue is unavailable. Reconnect to the environment and try again.",
  });
}

export function useT3TeamWorkflowOutboxActions(input: {
  readonly backend: T3TeamOutboxBackend | null | undefined;
  readonly environmentId: string | null;
  readonly threadId: string;
}) {
  const environment = useEnvironment(input.environmentId as never);
  const availableRef = useRef(false);
  availableRef.current = environment?.connection.phase === "connected";

  const resolveWorkflowDecision = useCallback(
    async (decision: {
      threadId: string;
      messageId: string;
      text: string;
      value: unknown;
      correlationId: string;
    }) => {
      if (!input.backend) return;
      if (!availableRef.current && input.environmentId) {
        const queued = enqueueT3TeamOutboxEntry(
          makeT3TeamOutboxEntry(
            "workflow-answer",
            {
              messageId: decision.messageId,
              text: decision.text,
              value: decision.value,
              correlationId: decision.correlationId,
            },
            input.environmentId,
            decision.threadId,
          ),
        );
        if (!queued) notifyOutboxPersistFailed();
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
    [input.backend, input.environmentId],
  );

  const submitRecipeCardAction = useCallback(
    async (action: { cardId: string; actionId: string; submit?: Record<string, unknown> }) => {
      if (!input.backend) return;
      if (!availableRef.current && input.environmentId) {
        const queued = enqueueT3TeamOutboxEntry(
          makeT3TeamOutboxEntry(
            "recipe-card-action",
            {
              cardId: action.cardId,
              actionId: action.actionId,
              submit: action.submit ?? null,
            },
            input.environmentId,
            input.threadId,
          ),
        );
        if (!queued) notifyOutboxPersistFailed();
        return;
      }
      await input.backend.submitRecipeCardAction({
        threadId: input.threadId,
        cardId: action.cardId,
        actionId: action.actionId,
        ...(action.submit ? { submit: action.submit } : {}),
      });
    },
    [input.backend, input.threadId, input.environmentId],
  );

  return { resolveWorkflowDecision, submitRecipeCardAction };
}
