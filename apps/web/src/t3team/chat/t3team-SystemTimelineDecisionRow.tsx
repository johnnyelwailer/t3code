/**
 * The timeline row for a message carrying a workflow question.
 *
 * One of three mutually exclusive shapes `T3TeamSystemTimelineRow` can take, and the largest, so it
 * lives here rather than inline. It re-derives its own attachments from the message — they are pure
 * getters — so the parent hands it only the message, the decision, and the callbacks.
 */
import type { ScopedThreadRef } from "@t3tools/contracts";

import type { ChatMessage } from "~/types";
import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";
import {
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
import { useOpenT3TeamWorkItemDraft } from "~/t3team/chat/t3team-useOpenWorkItemDraft";

export function T3TeamSystemTimelineDecisionRow({
  message,
  threadRef,
  workflowDecision,
  activeWorkflowInputMessageId,
  decisionUnavailableMessage,
  onSubmitRecipeCardAction,
  dispatchWorkflowDecision,
}: {
  readonly message: ChatMessage;
  readonly threadRef: ScopedThreadRef | null;
  readonly workflowDecision: NonNullable<ReturnType<typeof getT3TeamWorkflowDecisionAttachment>>;
  readonly activeWorkflowInputMessageId: string | null;
  readonly decisionUnavailableMessage: string | undefined;
  readonly onSubmitRecipeCardAction?: ChatViewT3TeamExtensionProps["onSubmitRecipeCardAction"];
  readonly dispatchWorkflowDecision?: ChatViewT3TeamExtensionProps["dispatchWorkflowDecision"];
}) {
  const openWorkItemDraft = useOpenT3TeamWorkItemDraft();
  const workflowCard = getT3TeamWorkflowCardAttachment(message);
  const widgetAttachments = getT3TeamWidgetAttachments(message);
  const genericAttachments = getT3TeamRenderableAttachments(message);

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
        {...(decisionUnavailableMessage ? { unavailableMessage: decisionUnavailableMessage } : {})}
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
        <T3TeamMessageAttachmentList
          attachments={genericAttachments}
          {...(message.text ? { fallbackText: message.text } : {})}
          onOpenWorkItemDraft={openWorkItemDraft}
        />
      ) : null}
    </div>
  );
}
