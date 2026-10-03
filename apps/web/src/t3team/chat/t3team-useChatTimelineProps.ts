import type { EnvironmentId, T3TeamThreadFacts, ThreadId } from "@t3tools/contracts";
import { useMemo } from "react";

import type { MessagesTimelineT3TeamProps } from "~/components/chat/MessagesTimeline";
import { useT3TeamThreadFacts } from "~/state/t3team-threadSideStreams";
import type { T3TeamThreadActivityRecord } from "~/t3team/chat/t3team-threadActivityRecord";
import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";

/**
 * The `t3team` prop of ChatView's `MessagesTimeline`: the host's workflow callbacks, the thread's
 * fork activity records and facts (workflow run status), and the working-row inputs.
 */
export function useT3TeamChatTimelineProps(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly extension: ChatViewT3TeamExtensionProps;
  readonly threadActivities: ReadonlyArray<T3TeamThreadActivityRecord>;
  /** Working-row and dock inputs computed by the host (active agents, activity word, …). */
  readonly workingRow: Pick<
    MessagesTimelineT3TeamProps,
    | "activeAgents"
    | "threadActivityState"
    | "threadActivityLabel"
    | "serverStartedAtMs"
    | "hasOpenUserInput"
    | "workflowCardNavigationRequest"
  >;
}): { readonly timelineProps: MessagesTimelineT3TeamProps; readonly facts?: T3TeamThreadFacts } {
  const facts = useT3TeamThreadFacts(input.environmentId, input.threadId);
  const { onSubmitRecipeCardAction, dispatchWorkflowDecision, onControlWorkflow, onOpenThread } =
    input.extension;
  const { threadActivities, workingRow } = input;
  const workflowRunStatus = facts?.workflowRunStatus ?? undefined;
  const timelineProps = useMemo<MessagesTimelineT3TeamProps>(
    () => ({
      ...workingRow,
      threadActivities,
      ...(workflowRunStatus ? { workflowRunStatus } : {}),
      ...(onSubmitRecipeCardAction ? { onSubmitRecipeCardAction } : {}),
      ...(dispatchWorkflowDecision ? { dispatchWorkflowDecision } : {}),
      ...(onControlWorkflow ? { onControlWorkflow } : {}),
      ...(onOpenThread ? { onOpenProjectThread: onOpenThread } : {}),
    }),
    [
      dispatchWorkflowDecision,
      onControlWorkflow,
      onOpenThread,
      onSubmitRecipeCardAction,
      threadActivities,
      workflowRunStatus,
      workingRow,
    ],
  );
  return facts === undefined ? { timelineProps } : { timelineProps, facts };
}
