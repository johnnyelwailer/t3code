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
  getT3workWorkflowCardAttachment,
  T3workMessageAttachmentList,
  T3workWorkflowCardBody,
} from "~/t3work/chat/t3work-messageExtViews";
import {
  getT3workWorkflowShapeAttachment,
  T3workWorkflowShapeCard,
} from "~/t3work/chat/t3work-messageShapeCard";

export function T3workSystemTimelineRow(props: {
  readonly message: ChatMessage;
  readonly threadRef: ScopedThreadRef | null;
  readonly activeWorkflowInputMessageId: string | null;
  readonly onSubmitRecipeCardAction?: ChatViewT3workExtensionProps["onSubmitRecipeCardAction"];
  readonly dispatchWorkflowDecision?: ChatViewT3workExtensionProps["dispatchWorkflowDecision"];
}) {
  const {
    message,
    threadRef,
    activeWorkflowInputMessageId,
    onSubmitRecipeCardAction,
    dispatchWorkflowDecision,
  } = props;

  const workflowCard = getT3workWorkflowCardAttachment(message);
  const workflowDecision = getT3workWorkflowDecisionAttachment(message);
  const workflowShape = getT3workWorkflowShapeAttachment(message);
  const genericAttachments = getT3workRenderableAttachments(message);
  const showMessageText =
    message.text.length > 0 &&
    !(workflowDecision && message.text.trim() === workflowDecision.question.trim()) &&
    !workflowShape;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[92%] rounded-2xl border border-border/70 bg-muted/25 px-4 py-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          System
        </p>
        {showMessageText ? (
          <p className="text-sm leading-6 text-foreground/90">{message.text}</p>
        ) : null}
        {workflowShape ? (
          <div className={showMessageText ? "mt-3" : undefined}>
            <T3workWorkflowShapeCard shape={workflowShape} />
          </div>
        ) : null}
        {workflowCard ? (
          <div className={showMessageText || workflowShape ? "mt-3" : undefined}>
            <T3workWorkflowCardBody
              workflowCard={workflowCard}
              {...(onSubmitRecipeCardAction ? { onSubmitRecipeCardAction } : {})}
            />
          </div>
        ) : null}
        {workflowDecision ? (
          <div className={showMessageText || workflowShape || workflowCard ? "mt-3" : undefined}>
            <T3workWorkflowDecisionCard
              decision={workflowDecision}
              active={activeWorkflowInputMessageId === message.id}
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
          </div>
        ) : null}
        {genericAttachments.length > 0 ? (
          <T3workMessageAttachmentList attachments={genericAttachments} />
        ) : null}
      </div>
    </div>
  );
}

export { findActiveWorkflowInputMessageId };
