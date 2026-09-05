import type { ScopedThreadRef } from "@t3tools/contracts";

import type { ChatMessage } from "~/types";
import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";
import {
  findActiveWorkflowInputMessageId,
  getT3TeamWorkflowDecisionAttachment,
} from "~/t3team/chat/t3team-messageDecisionCard";
import type { T3TeamWorkflowDecisionAnswer } from "~/t3team/chat/t3team-workflowDecisionAnswers";
import {
  getT3TeamRenderableAttachments,
  getT3TeamWidgetAttachments,
  getT3TeamWorkflowCardAttachment,
} from "~/t3team/chat/t3team-messageExtViews";
import { T3TeamWidgetBlock } from "~/t3team/chat/t3team-widgetBlock";
import { getT3TeamWorkflowShapeAttachment } from "~/t3team/chat/t3team-messageShapeCard";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { T3TeamSystemTimelineShapeRow } from "~/t3team/chat/t3team-SystemTimelineShapeRow";
import { T3TeamSystemTimelineDecisionRow } from "~/t3team/chat/t3team-SystemTimelineDecisionRow";
import { T3TeamSystemTimelineGenericRow } from "~/t3team/chat/t3team-SystemTimelineGenericRow";
import { T3TeamSystemTimelineNotificationBody } from "~/t3team/chat/t3team-SystemTimelineNotificationBody";
import { workflowDecisionUnavailableMessage } from "~/t3team/chat/t3team-workflowDecisionAvailability";

export function T3TeamSystemTimelineRow(props: {
  readonly message: ChatMessage;
  readonly threadRef: ScopedThreadRef | null;
  readonly markdownCwd?: string | undefined;
  readonly activeWorkflowInputMessageId: string | null;
  /** Every answered ask, keyed by the ask message's id — lets this row keep rendering the ask's
   * card in an answered state instead of vanishing, and suppress the reply's own bare row. */
  readonly workflowDecisionAnswers?: ReadonlyMap<string, T3TeamWorkflowDecisionAnswer>;
  /** A run's short, honest banner outcome line (never the full result), keyed by workflowRunId —
   * see `t3team-workflowRunOutcome.ts`. */
  readonly workflowRunOutcomeSummaries?: ReadonlyMap<string, string>;
  /** Live per-run step progress derived from thread activities (keyed by workflowRunId). */
  readonly workflowStepRuns?: ReadonlyMap<string, T3TeamWorkflowRunProgress>;
  readonly workflowRunStatus?: import("@t3tools/contracts").OrchestrationWorkflowRunStatus;
  readonly onSubmitRecipeCardAction?: ChatViewT3TeamExtensionProps["onSubmitRecipeCardAction"];
  readonly dispatchWorkflowDecision?: ChatViewT3TeamExtensionProps["dispatchWorkflowDecision"];
  readonly onControlWorkflow?: ChatViewT3TeamExtensionProps["onControlWorkflow"];
  readonly onOpenThread?: ChatViewT3TeamExtensionProps["onOpenThread"];
}) {
  const {
    message,
    threadRef,
    markdownCwd,
    activeWorkflowInputMessageId,
    workflowDecisionAnswers,
    workflowRunOutcomeSummaries,
    workflowStepRuns,
    workflowRunStatus,
    onSubmitRecipeCardAction,
    dispatchWorkflowDecision,
    onControlWorkflow,
    onOpenThread,
  } = props;

  const workflowCard = getT3TeamWorkflowCardAttachment(message);
  const workflowDecision = getT3TeamWorkflowDecisionAttachment(message);
  const decisionAnswer = workflowDecisionAnswers?.get(message.id);
  const decisionUnavailableMessage = workflowDecisionUnavailableMessage(
    workflowDecision,
    workflowRunStatus,
    workflowDecision?.workflowRunId
      ? workflowStepRuns?.get(workflowDecision.workflowRunId)
      : undefined,
    decisionAnswer !== undefined,
  );
  const workflowShape = getT3TeamWorkflowShapeAttachment(message);
  const genericAttachments = getT3TeamRenderableAttachments(message);
  const widgetAttachments = getT3TeamWidgetAttachments(message);
  const showMessageText =
    message.text.length > 0 &&
    !(workflowDecision && message.text.trim() === workflowDecision.question.trim()) &&
    !workflowShape;

  // A decision reply is always posted as a `role: "user"` message (see
  // `t3team-thread-recipe-workflow-routes-resolve.ts`), so it renders through `UserTimelineRow`,
  // never through this system row. The ask card (`T3TeamWorkflowDecisionCard`) settles to show the
  // chosen value, so a card-sourced reply would say it twice — the timeline drops that row
  // (`isVisibleMessagesTimelineRow`) and the card is the one place the answer lives. A reply the
  // user TYPED in the composer instead still renders as its own bubble: it is ordinary prose, not
  // an echo of a chip. Both are matched to their ask by `t3teamExt.workflowReply.correlationId`
  // (see `t3team-workflowDecisionAnswers.ts`), which is also what tells the two cases apart.

  if (workflowShape) {
    const outcomeSummary =
      workflowShape.workflowRunId !== undefined
        ? workflowRunOutcomeSummaries?.get(workflowShape.workflowRunId)
        : undefined;
    return (
      <T3TeamSystemTimelineShapeRow
        workflowShape={workflowShape}
        threadRef={threadRef}
        {...(workflowStepRuns ? { workflowStepRuns } : {})}
        {...(workflowRunStatus ? { workflowRunStatus } : {})}
        {...(onControlWorkflow ? { onControlWorkflow } : {})}
        {...(onOpenThread ? { onOpenThread } : {})}
        {...(outcomeSummary ? { outcomeSummary } : {})}
      />
    );
  }

  if (workflowDecision) {
    return (
      <T3TeamSystemTimelineDecisionRow
        message={message}
        threadRef={threadRef}
        workflowDecision={workflowDecision}
        activeWorkflowInputMessageId={activeWorkflowInputMessageId}
        decisionUnavailableMessage={decisionUnavailableMessage}
        {...(decisionAnswer ? { answer: decisionAnswer } : {})}
        {...(onSubmitRecipeCardAction ? { onSubmitRecipeCardAction } : {})}
        {...(dispatchWorkflowDecision ? { dispatchWorkflowDecision } : {})}
      />
    );
  }

  const trustedHistoricalHtml =
    message.t3teamExt?.author?.kind === "system" &&
    message.t3teamExt.author.workflowRunId !== undefined &&
    /<\/?[a-z][^>]*>/i.test(message.text);
  if (trustedHistoricalHtml) {
    return (
      <div className="w-full max-w-[92%]">
        <T3TeamWidgetBlock
          widget={{
            widgetId: `historical-workflow:${message.id}`,
            title: "workflow_notification",
            format: message.text.trimStart().startsWith("<svg") ? "svg" : "html",
            html: message.text,
          }}
          threadRef={threadRef}
        />
      </div>
    );
  }

  const widgetOnly =
    widgetAttachments.length > 0 &&
    !showMessageText &&
    !workflowCard &&
    genericAttachments.length === 0;
  if (widgetOnly) {
    return (
      <div className="flex w-full max-w-[92%] flex-col items-start gap-2">
        {widgetAttachments.map((attachment) => (
          <T3TeamWidgetBlock
            key={`t3team-widget:${attachment.widget.widgetId}`}
            widget={attachment.widget}
            threadRef={threadRef}
          />
        ))}
      </div>
    );
  }

  const workflowNotification =
    message.t3teamExt?.author?.kind === "system" &&
    message.t3teamExt.author.workflowRunId !== undefined &&
    !workflowCard &&
    genericAttachments.length === 0 &&
    widgetAttachments.length === 0;
  if (workflowNotification) {
    return showMessageText ? (
      <T3TeamSystemTimelineNotificationBody
        text={message.text}
        threadRef={threadRef}
        {...(markdownCwd ? { markdownCwd } : {})}
      />
    ) : null;
  }

  return (
    <T3TeamSystemTimelineGenericRow
      message={message}
      threadRef={threadRef}
      showMessageText={showMessageText}
      {...(markdownCwd ? { markdownCwd } : {})}
      {...(onSubmitRecipeCardAction ? { onSubmitRecipeCardAction } : {})}
    />
  );
}

export { findActiveWorkflowInputMessageId };
