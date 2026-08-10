import type { ScopedThreadRef } from "@t3tools/contracts";

import ChatMarkdown from "~/components/ChatMarkdown";
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
  T3TeamMessageAttachmentList,
  T3TeamWorkflowCardBody,
} from "~/t3team/chat/t3team-messageExtViews";
import { T3TeamWidgetBlock } from "~/t3team/chat/t3team-widgetBlock";
import { getT3TeamWorkflowShapeAttachment } from "~/t3team/chat/t3team-messageShapeCard";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { useOpenT3TeamWorkItemDraft } from "~/t3team/chat/t3team-useOpenWorkItemDraft";
import { T3TeamSystemTimelineShapeRow } from "~/t3team/chat/t3team-SystemTimelineShapeRow";
import { T3TeamSystemTimelineDecisionRow } from "~/t3team/chat/t3team-SystemTimelineDecisionRow";
import { workflowDecisionUnavailableMessage } from "~/t3team/chat/t3team-workflowDecisionAvailability";

export function T3TeamSystemTimelineRow(props: {
  readonly message: ChatMessage;
  readonly threadRef: ScopedThreadRef | null;
  readonly markdownCwd?: string | undefined;
  readonly activeWorkflowInputMessageId: string | null;
  /** Every answered ask, keyed by the ask message's id — lets this row keep rendering the ask's
   * card in an answered state instead of vanishing, and suppress the reply's own bare row. */
  readonly workflowDecisionAnswers?: ReadonlyMap<string, T3TeamWorkflowDecisionAnswer>;
  /** Live per-run step progress derived from thread activities (keyed by workflowRunId). */
  readonly workflowStepRuns?: ReadonlyMap<string, T3TeamWorkflowRunProgress>;
  readonly workflowRunStatus?: import("@t3tools/contracts").OrchestrationWorkflowRunStatus;
  readonly onSubmitRecipeCardAction?: ChatViewT3TeamExtensionProps["onSubmitRecipeCardAction"];
  readonly dispatchWorkflowDecision?: ChatViewT3TeamExtensionProps["dispatchWorkflowDecision"];
  readonly onControlWorkflow?: ChatViewT3TeamExtensionProps["onControlWorkflow"];
  readonly onOpenThread?: ChatViewT3TeamExtensionProps["onOpenThread"];
}) {
  const openWorkItemDraft = useOpenT3TeamWorkItemDraft();
  const {
    message,
    threadRef,
    markdownCwd,
    activeWorkflowInputMessageId,
    workflowDecisionAnswers,
    workflowStepRuns,
    workflowRunStatus,
    onSubmitRecipeCardAction,
    dispatchWorkflowDecision,
    onControlWorkflow,
    onOpenThread,
  } = props;

  const workflowCard = getT3TeamWorkflowCardAttachment(message);
  const workflowDecision = getT3TeamWorkflowDecisionAttachment(message);
  const decisionUnavailableMessage = workflowDecisionUnavailableMessage(
    workflowDecision,
    workflowRunStatus,
    workflowDecision?.workflowRunId
      ? workflowStepRuns?.get(workflowDecision.workflowRunId)
      : undefined,
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
  // never through this system row — suppression for it lives there instead (matched by
  // `t3teamExt.workflowReply.correlationId`, not by id-in-a-set here).

  if (workflowShape) {
    return (
      <T3TeamSystemTimelineShapeRow
        workflowShape={workflowShape}
        threadRef={threadRef}
        {...(workflowStepRuns ? { workflowStepRuns } : {})}
        {...(workflowRunStatus ? { workflowRunStatus } : {})}
        {...(onControlWorkflow ? { onControlWorkflow } : {})}
        {...(onOpenThread ? { onOpenThread } : {})}
      />
    );
  }

  if (workflowDecision) {
    const answer = workflowDecisionAnswers?.get(message.id);
    return (
      <T3TeamSystemTimelineDecisionRow
        message={message}
        threadRef={threadRef}
        workflowDecision={workflowDecision}
        activeWorkflowInputMessageId={activeWorkflowInputMessageId}
        decisionUnavailableMessage={decisionUnavailableMessage}
        {...(answer ? { answer } : {})}
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
      <div className="max-w-[92%] text-sm leading-6 text-foreground/90">
        <ChatMarkdown text={message.text} cwd={markdownCwd} threadRef={threadRef ?? undefined} />
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[92%] rounded-2xl border border-border/70 bg-muted/25 px-4 py-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          System
        </p>
        {showMessageText ? (
          <div className="text-sm leading-6 text-foreground/90">
            <ChatMarkdown
              text={message.text}
              cwd={markdownCwd}
              threadRef={threadRef ?? undefined}
            />
          </div>
        ) : null}
        {workflowCard ? (
          <div className={showMessageText ? "mt-3" : undefined}>
            <T3TeamWorkflowCardBody
              workflowCard={workflowCard}
              {...(onSubmitRecipeCardAction ? { onSubmitRecipeCardAction } : {})}
            />
          </div>
        ) : null}
        {widgetAttachments.map((attachment) => (
          <div
            key={`t3team-widget:${attachment.widget.widgetId}`}
            className={
              showMessageText || workflowShape || workflowCard || workflowDecision
                ? "mt-3"
                : undefined
            }
          >
            <T3TeamWidgetBlock widget={attachment.widget} threadRef={threadRef} />
          </div>
        ))}
        {genericAttachments.length > 0 ? (
          <T3TeamMessageAttachmentList
            attachments={genericAttachments}
            {...(message.text ? { fallbackText: message.text } : {})}
            onOpenWorkItemDraft={openWorkItemDraft}
          />
        ) : null}
      </div>
    </div>
  );
}

export { findActiveWorkflowInputMessageId };
