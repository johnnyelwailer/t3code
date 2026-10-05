import type {
  EnvironmentId,
  OrchestrationV2TurnItem,
  RunId,
  T3TeamThreadFacts,
  ThreadId,
} from "@t3tools/contracts";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import type { MessagesTimelineT3TeamProps } from "~/components/chat/MessagesTimeline";
import { usePrimarySettings } from "~/hooks/useSettings";
import { useT3TeamThreadFacts } from "~/state/t3team-threadSideStreams";
import { deriveT3TeamActivityState } from "~/t3team/t3team-activityStateDerive";
import type { ChatMessage } from "~/types";
import {
  deriveT3TeamActiveWorkflowDockItems,
  T3TeamActiveWorkflowDock,
  type T3TeamActiveWorkflowDockItem,
} from "~/t3team/chat/t3team-activeWorkflowDock";
import type { T3TeamThreadActivityRecord } from "~/t3team/chat/t3team-threadActivityRecord";
import { deriveT3TeamWorkflowStepRuns } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import type { T3TeamTimelineRowProps } from "~/t3team/chat/t3team-timelineRowProps";
import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";

type WorkingRowProps = Pick<
  MessagesTimelineT3TeamProps,
  "activeAgents" | "serverStartedAtMs" | "hasOpenUserInput"
>;

/**
 * ChatView's fork surface: the `t3team` prop of its `MessagesTimeline` (the host's workflow
 * callbacks, the thread's fork activity records and facts, the working-row inputs) and the
 * composer's leading dock (active workflow runs, then the host's own banner, e.g. the outbox).
 */
export function useT3TeamChatTimelineProps(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly extension: ChatViewT3TeamExtensionProps;
  readonly timelineEntries: ReadonlyArray<{
    readonly kind: string;
    readonly message?: ChatMessage;
  }>;
  readonly threadActivities: ReadonlyArray<T3TeamThreadActivityRecord>;
  /** Working-row inputs computed by the host (active agents, server boot, open question). */
  readonly workingRow: WorkingRowProps;
  /** Live-run state the working row's activity word derives from. */
  readonly activity: {
    readonly isWorking: boolean;
    readonly waitingOnUser: boolean;
    readonly activeRunId: RunId | null;
    readonly turnItems: ReadonlyArray<OrchestrationV2TurnItem> | undefined;
  };
}): {
  readonly timelineProps: MessagesTimelineT3TeamProps;
  readonly composerBannerLeading: ReactNode;
  readonly facts: T3TeamThreadFacts | undefined;
} {
  const facts = useT3TeamThreadFacts(input.environmentId, input.threadId);
  const {
    onSubmitRecipeCardAction,
    dispatchWorkflowDecision,
    onControlWorkflow,
    onOpenThread,
    composerBannerLeading: hostBannerLeading,
  } = input.extension;
  const { threadActivities, timelineEntries, workingRow } = input;
  const workflowRunStatus = facts?.workflowRunStatus ?? undefined;
  const { isWorking, waitingOnUser, activeRunId, turnItems } = input.activity;
  const threadActivityState = useMemo(
    () =>
      deriveT3TeamActivityState({
        isWorking,
        waitingOnUser,
        activeRunId,
        turnItems: turnItems ?? [],
      }),
    [activeRunId, isWorking, turnItems, waitingOnUser],
  );
  const labelsEnabled = usePrimarySettings((settings) => settings.t3teamActivityLabelsEnabled);
  const threadActivityLabel = labelsEnabled ? (facts?.activityLabel ?? null) : null;

  const [navigationRequest, setNavigationRequest] = useState<NonNullable<
    T3TeamTimelineRowProps["workflowCardNavigationRequest"]
  > | null>(null);
  const openWorkflowCard = useCallback((item: T3TeamActiveWorkflowDockItem) => {
    setNavigationRequest((previous) => ({
      messageId: item.messageId,
      requestId: (previous?.requestId ?? 0) + 1,
    }));
  }, []);
  const dockItems = useMemo(
    () =>
      deriveT3TeamActiveWorkflowDockItems(
        timelineEntries,
        deriveT3TeamWorkflowStepRuns(threadActivities),
        workflowRunStatus,
      ),
    [threadActivities, timelineEntries, workflowRunStatus],
  );
  const composerBannerLeading = useMemo(
    () =>
      dockItems.length === 0 && hostBannerLeading === undefined ? null : (
        <>
          {dockItems.length > 0 ? (
            <T3TeamActiveWorkflowDock items={dockItems} onOpen={openWorkflowCard} />
          ) : null}
          {hostBannerLeading}
        </>
      ),
    [dockItems, hostBannerLeading, openWorkflowCard],
  );

  const timelineProps = useMemo<MessagesTimelineT3TeamProps>(
    () => ({
      ...workingRow,
      threadActivityState,
      threadActivityLabel,
      threadActivities,
      workflowCardNavigationRequest: navigationRequest,
      ...(workflowRunStatus ? { workflowRunStatus } : {}),
      ...(onSubmitRecipeCardAction ? { onSubmitRecipeCardAction } : {}),
      ...(dispatchWorkflowDecision ? { dispatchWorkflowDecision } : {}),
      ...(onControlWorkflow ? { onControlWorkflow } : {}),
      ...(onOpenThread ? { onOpenProjectThread: onOpenThread } : {}),
    }),
    [
      dispatchWorkflowDecision,
      navigationRequest,
      onControlWorkflow,
      onOpenThread,
      onSubmitRecipeCardAction,
      threadActivities,
      threadActivityLabel,
      threadActivityState,
      workflowRunStatus,
      workingRow,
    ],
  );
  return { timelineProps, composerBannerLeading, facts };
}
