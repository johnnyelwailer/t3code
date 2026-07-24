import type { ScopedThreadRef } from "@t3tools/contracts";

import type { ChatMessage } from "~/types";
import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";
import {
  findActiveWorkflowInputMessageId,
  getT3TeamWorkflowDecisionAttachment,
  T3TeamWorkflowDecisionCard,
} from "~/t3team/chat/t3team-messageDecisionCard";
import {
  getT3TeamRenderableAttachments,
  getT3TeamWidgetAttachments,
  getT3TeamWorkflowCardAttachment,
  T3TeamMessageAttachmentList,
  T3TeamWorkflowCardBody,
} from "~/t3team/chat/t3team-messageExtViews";
import { T3TeamWidgetBlock } from "~/t3team/chat/t3team-widgetBlock";
import {
  getT3TeamWorkflowShapeAttachment,
  T3TeamWorkflowShapeCard,
} from "~/t3team/chat/t3team-messageShapeCard";
import { T3TeamWorkflowShapeLiveCard } from "~/t3team/chat/t3team-messageShapeCardLive";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { useMergedThreads } from "~/t3team/t3team-mergedThreads";

const TERMINAL_WORKFLOW_STATUSES = new Set(["completed", "failed", "cancelled"]);

function workflowDecisionUnavailableMessage(
  decision: ReturnType<typeof getT3TeamWorkflowDecisionAttachment>,
  workflowRunStatus: import("@t3tools/contracts").OrchestrationWorkflowRunStatus | undefined,
  workflowRunProgress: T3TeamWorkflowRunProgress | undefined,
): string | undefined {
  if (!decision) {
    return undefined;
  }
  const historicalTerminalPhase = workflowRunProgress?.run?.phase;
  const currentRunTerminalStatus =
    workflowRunStatus !== undefined &&
    workflowRunStatus.runId === decision.workflowRunId &&
    TERMINAL_WORKFLOW_STATUSES.has(workflowRunStatus.status)
      ? workflowRunStatus.status
      : undefined;
  const terminalStatus =
    historicalTerminalPhase !== undefined && TERMINAL_WORKFLOW_STATUSES.has(historicalTerminalPhase)
      ? historicalTerminalPhase
      : currentRunTerminalStatus;
  if (terminalStatus === undefined) {
    return undefined;
  }
  return terminalStatus === "cancelled"
    ? "This question is no longer available because the workflow was stopped."
    : "This question is no longer available because the workflow has ended.";
}

export function T3TeamSystemTimelineRow(props: {
  readonly message: ChatMessage;
  readonly threadRef: ScopedThreadRef | null;
  readonly activeWorkflowInputMessageId: string | null;
  /** Live per-run step progress derived from thread activities (keyed by workflowRunId). */
  readonly workflowStepRuns?: ReadonlyMap<string, T3TeamWorkflowRunProgress>;
  readonly workflowRunStatus?: import("@t3tools/contracts").OrchestrationWorkflowRunStatus;
  readonly onSubmitRecipeCardAction?: ChatViewT3TeamExtensionProps["onSubmitRecipeCardAction"];
  readonly dispatchWorkflowDecision?: ChatViewT3TeamExtensionProps["dispatchWorkflowDecision"];
  readonly onControlWorkflow?: ChatViewT3TeamExtensionProps["onControlWorkflow"];
  readonly onOpenThread?: ChatViewT3TeamExtensionProps["onOpenThread"];
}) {
  const mergedThreads = useMergedThreads();
  const childStatuses = Object.fromEntries(
    mergedThreads.flatMap((thread) =>
      thread.childStatus ? [[thread.id, thread.childStatus] as const] : [],
    ),
  );
  const {
    message,
    threadRef,
    activeWorkflowInputMessageId,
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
  const workflowShapeProgress =
    workflowShape?.workflowRunId !== undefined
      ? (workflowStepRuns?.get(workflowShape.workflowRunId) ?? null)
      : null;
  const genericAttachments = getT3TeamRenderableAttachments(message);
  const widgetAttachments = getT3TeamWidgetAttachments(message);
  const showMessageText =
    message.text.length > 0 &&
    !(workflowDecision && message.text.trim() === workflowDecision.question.trim()) &&
    !workflowShape;

  if (workflowShape) {
    return (
      <div className="max-w-[92%]">
        {workflowShapeProgress ? (
          <T3TeamWorkflowShapeLiveCard
            shape={workflowShape}
            progress={workflowShapeProgress}
            {...(workflowRunStatus?.runId === workflowShape.workflowRunId
              ? { workflowRunStatus }
              : {})}
            {...(onControlWorkflow ? { onControlWorkflow } : {})}
            {...(onOpenThread ? { onOpenThread } : {})}
            childStatuses={childStatuses}
          />
        ) : (
          <T3TeamWorkflowShapeCard shape={workflowShape} />
        )}
      </div>
    );
  }

  if (workflowDecision) {
    return (
      <div className="flex max-w-[92%] flex-col items-start gap-2">
        {workflowCard ? (
          <T3TeamWorkflowCardBody
            workflowCard={workflowCard}
            {...(onSubmitRecipeCardAction ? { onSubmitRecipeCardAction } : {})}
          />
        ) : null}
        {widgetAttachments.map((attachment) => (
          <T3TeamWidgetBlock
            key={`t3team-widget:${attachment.widget.widgetId}`}
            widget={attachment.widget}
            threadRef={threadRef}
          />
        ))}
        <T3TeamWorkflowDecisionCard
          decision={workflowDecision}
          active={
            activeWorkflowInputMessageId === message.id && decisionUnavailableMessage === undefined
          }
          {...(decisionUnavailableMessage
            ? { unavailableMessage: decisionUnavailableMessage }
            : {})}
          onChoose={
            dispatchWorkflowDecision && threadRef
              ? async ({ choice, value, correlationId }) => {
                  await dispatchWorkflowDecision({
                    threadId: threadRef.threadId,
                    messageId: message.id,
                    text: choice,
                    value,
                    correlationId,
                  });
                }
              : undefined
          }
        />
        {genericAttachments.length > 0 ? (
          <T3TeamMessageAttachmentList attachments={genericAttachments} />
        ) : null}
      </div>
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
      <p className="max-w-[92%] text-sm leading-6 text-foreground/90">{message.text}</p>
    ) : null;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[92%] rounded-2xl border border-border/70 bg-muted/25 px-4 py-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          System
        </p>
        {showMessageText ? (
          <p className="text-sm leading-6 text-foreground/90">{message.text}</p>
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
          <T3TeamMessageAttachmentList attachments={genericAttachments} />
        ) : null}
      </div>
    </div>
  );
}

export { findActiveWorkflowInputMessageId };
