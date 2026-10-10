/**
 * The fork rich-row seam of `MessagesTimeline`: `system` message rows (workflow notifications,
 * decision cards, plan/shape cards, widgets, generic fork attachments) render through
 * `T3TeamSystemTimelineRow`, fed by one context derived from the timeline entries and the
 * timeline's `t3team` prop (`T3TeamTimelineRowProps`).
 *
 * The timeline keeps the upstream row context untouched: it provides this context once, routes
 * `role === "system"` message rows here, and filters rows through `isT3TeamTimelineRowVisible`.
 */
import type { OrchestrationWorkflowRunStatus, ScopedThreadRef } from "@t3tools/contracts";
import { createContext, use, useMemo } from "react";

import type { ChatMessage } from "~/types";
import { findActiveWorkflowInputMessageId } from "~/t3team/chat/t3team-messageDecisionCard";
import { T3TeamSystemTimelineRow } from "~/t3team/chat/t3team-SystemTimelineRow";
import { isT3TeamFullBleedWidgetRow } from "~/t3team/chat/t3team-fullBleedWidgetRow";
import {
  deriveT3TeamWorkflowStepRuns,
  type T3TeamWorkflowRunProgress,
} from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import type { T3TeamTimelineRowProps } from "~/t3team/chat/t3team-timelineRowProps";
import {
  findT3TeamWorkflowDecisionAnswers,
  type T3TeamWorkflowDecisionAnswer,
} from "~/t3team/chat/t3team-workflowDecisionAnswers";
import { findT3TeamWorkflowRunOutcomeSummaries } from "~/t3team/chat/t3team-workflowRunOutcome";

type TimelineEntryLike = { readonly kind: string; readonly message?: ChatMessage };

export interface T3TeamTimelineRowsState {
  readonly activeWorkflowInputMessageId: string | null;
  readonly workflowDecisionAnswers: ReadonlyMap<string, T3TeamWorkflowDecisionAnswer>;
  readonly workflowRunOutcomeSummaries: ReadonlyMap<string, string>;
  readonly workflowStepRuns: ReadonlyMap<string, T3TeamWorkflowRunProgress>;
  readonly workflowRunStatus: OrchestrationWorkflowRunStatus | undefined;
  /** Replies a decision card already shows as its answer; their own rows are hidden. */
  readonly cardAnsweredReplyMessageIds: ReadonlySet<string>;
  readonly callbacks: Pick<
    T3TeamTimelineRowProps,
    "onSubmitRecipeCardAction" | "dispatchWorkflowDecision" | "onControlWorkflow"
  > & { readonly onOpenThread?: T3TeamTimelineRowProps["onOpenProjectThread"] };
}

const EMPTY_STATE: T3TeamTimelineRowsState = {
  activeWorkflowInputMessageId: null,
  workflowDecisionAnswers: new Map(),
  workflowRunOutcomeSummaries: new Map(),
  workflowStepRuns: new Map(),
  workflowRunStatus: undefined,
  cardAnsweredReplyMessageIds: new Set(),
  callbacks: {},
};

const T3TeamTimelineRowsCtx = createContext<T3TeamTimelineRowsState>(EMPTY_STATE);
export const T3TeamTimelineRowsProvider = T3TeamTimelineRowsCtx;

export function useT3TeamTimelineRowsState(
  props: T3TeamTimelineRowProps,
  timelineEntries: ReadonlyArray<TimelineEntryLike>,
): T3TeamTimelineRowsState {
  const {
    threadActivities,
    workflowRunStatus,
    onSubmitRecipeCardAction,
    dispatchWorkflowDecision,
    onControlWorkflow,
    onOpenProjectThread,
  } = props;
  const entryState = useMemo(() => {
    const workflowDecisionAnswers = findT3TeamWorkflowDecisionAnswers(timelineEntries);
    return {
      activeWorkflowInputMessageId: findActiveWorkflowInputMessageId(timelineEntries),
      workflowDecisionAnswers,
      workflowRunOutcomeSummaries: findT3TeamWorkflowRunOutcomeSummaries(timelineEntries),
      cardAnsweredReplyMessageIds: new Set(
        [...workflowDecisionAnswers.values()].map((answer) => answer.answerMessageId),
      ),
    };
  }, [timelineEntries]);
  const workflowStepRuns = useMemo(
    () => deriveT3TeamWorkflowStepRuns(threadActivities ?? []),
    [threadActivities],
  );
  return useMemo(
    () => ({
      ...entryState,
      workflowStepRuns,
      workflowRunStatus,
      callbacks: {
        ...(onSubmitRecipeCardAction ? { onSubmitRecipeCardAction } : {}),
        ...(dispatchWorkflowDecision ? { dispatchWorkflowDecision } : {}),
        ...(onControlWorkflow ? { onControlWorkflow } : {}),
        ...(onOpenProjectThread ? { onOpenThread: onOpenProjectThread } : {}),
      },
    }),
    [
      dispatchWorkflowDecision,
      entryState,
      onControlWorkflow,
      onOpenProjectThread,
      onSubmitRecipeCardAction,
      workflowRunStatus,
      workflowStepRuns,
    ],
  );
}

/**
 * Hidden message rows: fork transport the user never sees (`visibleToUser: false`), and a
 * decision card's own correlated reply — the card states the answer. A reply TYPED in the
 * composer carries no `workflowReply` and keeps rendering as conversation.
 */
export function isT3TeamTimelineRowVisible(
  row: { readonly kind: string; readonly message?: ChatMessage },
  state: T3TeamTimelineRowsState,
): boolean {
  if (row.kind !== "message" || row.message === undefined) return true;
  const ext = row.message.t3teamExt;
  if (ext?.visibleToUser === false) return false;
  return !(
    state.cardAnsweredReplyMessageIds.has(row.message.id) &&
    ext?.workflowReply?.correlationId !== undefined
  );
}

/** Full-bleed widget rows span the whole content width; every other row keeps the lane. */
export function isT3TeamFullBleedTimelineRow(row: {
  readonly kind: string;
  readonly message?: ChatMessage;
}): boolean {
  return (
    row.kind === "message" && row.message !== undefined && isT3TeamFullBleedWidgetRow(row.message)
  );
}

export function T3TeamSystemMessageRow(props: {
  readonly message: ChatMessage;
  readonly threadRef: ScopedThreadRef | null;
  readonly markdownCwd: string | undefined;
}) {
  const state = use(T3TeamTimelineRowsCtx);
  return (
    <T3TeamSystemTimelineRow
      message={props.message}
      threadRef={props.threadRef}
      markdownCwd={props.markdownCwd}
      activeWorkflowInputMessageId={state.activeWorkflowInputMessageId}
      workflowDecisionAnswers={state.workflowDecisionAnswers}
      workflowRunOutcomeSummaries={state.workflowRunOutcomeSummaries}
      workflowStepRuns={state.workflowStepRuns}
      {...(state.workflowRunStatus ? { workflowRunStatus: state.workflowRunStatus } : {})}
      {...state.callbacks}
    />
  );
}
