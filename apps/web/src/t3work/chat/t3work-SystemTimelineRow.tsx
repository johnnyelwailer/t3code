import type { ScopedThreadRef } from "@t3tools/contracts";

import type { ChatMessage } from "~/types";
import type { ChatViewT3workExtensionProps } from "~/t3work/t3work-chatViewExtensions";
import {
  findActiveWorkflowInputMessageId,
  getT3workWorkflowDecisionAttachment,
  T3workWorkflowDecisionCard,
} from "~/t3work/chat/t3work-messageDecisionCard";
import {
  getT3workRenderableAttachments,
  getT3workWidgetAttachments,
  getT3workWorkflowCardAttachment,
  T3workMessageAttachmentList,
  T3workWorkflowCardBody,
} from "~/t3work/chat/t3work-messageExtViews";
import { T3workWidgetBlock } from "~/t3work/chat/t3work-widgetBlock";
import {
  getT3workWorkflowShapeAttachment,
  T3workWorkflowShapeCard,
} from "~/t3work/chat/t3work-messageShapeCard";
import { T3workWorkflowShapeLiveCard } from "~/t3work/chat/t3work-messageShapeCardLive";
import type { T3workWorkflowRunProgress } from "~/t3work/chat/t3work-threadWorkflowStepProgress";
import { useMergedThreads } from "~/t3work/t3work-mergedThreads";

const TERMINAL_WORKFLOW_STATUSES = new Set(["completed", "failed", "cancelled"]);

function workflowDecisionUnavailableMessage(
  decision: ReturnType<typeof getT3workWorkflowDecisionAttachment>,
  workflowRunStatus: import("@t3tools/contracts").OrchestrationWorkflowRunStatus | undefined,
  workflowRunProgress: T3workWorkflowRunProgress | undefined,
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

export function T3workSystemTimelineRow(props: {
  readonly message: ChatMessage;
  readonly threadRef: ScopedThreadRef | null;
  readonly activeWorkflowInputMessageId: string | null;
  /** Live per-run step progress derived from thread activities (keyed by workflowRunId). */
  readonly workflowStepRuns?: ReadonlyMap<string, T3workWorkflowRunProgress>;
  readonly workflowRunStatus?: import("@t3tools/contracts").OrchestrationWorkflowRunStatus;
  readonly onSubmitRecipeCardAction?: ChatViewT3workExtensionProps["onSubmitRecipeCardAction"];
  readonly dispatchWorkflowDecision?: ChatViewT3workExtensionProps["dispatchWorkflowDecision"];
  readonly onControlWorkflow?: ChatViewT3workExtensionProps["onControlWorkflow"];
  readonly onOpenThread?: ChatViewT3workExtensionProps["onOpenThread"];
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

  const workflowCard = getT3workWorkflowCardAttachment(message);
  const workflowDecision = getT3workWorkflowDecisionAttachment(message);
  const decisionUnavailableMessage = workflowDecisionUnavailableMessage(
    workflowDecision,
    workflowRunStatus,
    workflowDecision?.workflowRunId
      ? workflowStepRuns?.get(workflowDecision.workflowRunId)
      : undefined,
  );
  const workflowShape = getT3workWorkflowShapeAttachment(message);
  const workflowShapeProgress =
    workflowShape?.workflowRunId !== undefined
      ? (workflowStepRuns?.get(workflowShape.workflowRunId) ?? null)
      : null;
  const genericAttachments = getT3workRenderableAttachments(message);
  const widgetAttachments = getT3workWidgetAttachments(message);
  const showMessageText =
    message.text.length > 0 &&
    !(workflowDecision && message.text.trim() === workflowDecision.question.trim()) &&
    !workflowShape;

  if (workflowShape) {
    return (
      <div className="max-w-[92%]">
        {workflowShapeProgress ? (
          <T3workWorkflowShapeLiveCard
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
          <T3workWorkflowShapeCard shape={workflowShape} />
        )}
      </div>
    );
  }

  if (workflowDecision) {
    return (
      <div className="flex max-w-[92%] flex-col items-start gap-2">
        {workflowCard ? (
          <T3workWorkflowCardBody
            workflowCard={workflowCard}
            {...(onSubmitRecipeCardAction ? { onSubmitRecipeCardAction } : {})}
          />
        ) : null}
        <T3workWorkflowDecisionCard
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
          <T3workMessageAttachmentList attachments={genericAttachments} />
        ) : null}
        {widgetAttachments.map((attachment) => (
          <div key={`t3work-widget:${attachment.widget.widgetId}`}>
            <T3workWidgetBlock widget={attachment.widget} threadRef={threadRef} />
          </div>
        ))}
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
          <T3workWidgetBlock
            key={`t3work-widget:${attachment.widget.widgetId}`}
            widget={attachment.widget}
            threadRef={threadRef}
          />
        ))}
      </div>
    );
  }

  const workflowNotification =
    message.t3workExt?.author?.kind === "system" &&
    message.t3workExt.author.workflowRunId !== undefined &&
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
            <T3workWorkflowCardBody
              workflowCard={workflowCard}
              {...(onSubmitRecipeCardAction ? { onSubmitRecipeCardAction } : {})}
            />
          </div>
        ) : null}
        {widgetAttachments.map((attachment) => (
          <div
            key={`t3work-widget:${attachment.widget.widgetId}`}
            className={
              showMessageText || workflowShape || workflowCard || workflowDecision
                ? "mt-3"
                : undefined
            }
          >
            <T3workWidgetBlock widget={attachment.widget} threadRef={threadRef} />
          </div>
        ))}
        {genericAttachments.length > 0 ? (
          <T3workMessageAttachmentList attachments={genericAttachments} />
        ) : null}
      </div>
    </div>
  );
}

export { findActiveWorkflowInputMessageId };
