import { useCallback, useMemo } from "react";
import type { EnvironmentId } from "@t3tools/contracts";

import { readPreparedConnection } from "~/state/session";
import { createEnvironmentWorkflowBackend } from "~/t3team/backend/t3team-environmentWorkflowBackend";
import { useT3TeamThreadOutboxDock } from "~/t3team/chat/t3team-useThreadOutboxDock";
import { useT3TeamWorkflowOutboxActions } from "~/t3team/outbox/t3team-useWorkflowOutboxActions";
import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";

/**
 * The workflow-card extension props for a thread opened on upstream's `/$environmentId/$threadId`
 * route, where no Team thread view wraps the ChatView — a cloud session's threads open there. The
 * Team view builds the same props from the PRIMARY backend; here they are built from the thread's
 * OWN environment, because that server owns the workflow and its pending ask.
 *
 * Answers go through the same outbox path as the Team view (direct while the environment is
 * connected, queued and drained on reconnect otherwise).
 */
export function useT3TeamEnvironmentThreadExtension(
  environmentId: EnvironmentId,
  threadId: string,
): ChatViewT3TeamExtensionProps {
  const backend = useMemo(
    () =>
      createEnvironmentWorkflowBackend({
        resolveConnection: () => readPreparedConnection(environmentId),
      }),
    [environmentId],
  );
  const { resolveWorkflowDecision, submitRecipeCardAction } = useT3TeamWorkflowOutboxActions({
    backend,
    environmentId,
    threadId,
  });
  const composerBannerLeading = useT3TeamThreadOutboxDock(environmentId, threadId, backend);
  const onControlWorkflow = useCallback<
    NonNullable<ChatViewT3TeamExtensionProps["onControlWorkflow"]>
  >(
    ({ workflowRunId, action }) => backend.controlWorkflow({ threadId, workflowRunId, action }),
    [backend, threadId],
  );
  return useMemo(
    () => ({
      dispatchWorkflowDecision: resolveWorkflowDecision,
      onSubmitRecipeCardAction: submitRecipeCardAction,
      onControlWorkflow,
      ...(composerBannerLeading ? { composerBannerLeading } : {}),
    }),
    [composerBannerLeading, onControlWorkflow, resolveWorkflowDecision, submitRecipeCardAction],
  );
}
