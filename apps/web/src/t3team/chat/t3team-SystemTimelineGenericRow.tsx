/**
 * The generic system-notice card — the fallback of the three mutually exclusive shapes
 * `T3TeamSystemTimelineRow` can take (sibling of `T3TeamSystemTimelineShapeRow` and
 * `T3TeamSystemTimelineDecisionRow`), split out to keep that file under the prefixed-file LOC
 * ceiling. It re-derives its own attachments from the message — pure getters — so the parent
 * hands it only the message, the callbacks, and the one flag (`showMessageText`) that depends on
 * sibling-shape checks it already made.
 */
import type { ScopedThreadRef } from "@t3tools/contracts";

import ChatMarkdown from "~/components/ChatMarkdown";
import type { ChatMessage } from "~/types";
import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";
import {
  getT3TeamRenderableAttachments,
  getT3TeamWidgetAttachments,
  getT3TeamWorkflowCardAttachment,
  T3TeamMessageAttachmentList,
  T3TeamWorkflowCardBody,
} from "~/t3team/chat/t3team-messageExtViews";
import { T3TeamWidgetBlock } from "~/t3team/chat/t3team-widgetBlock";
import { useOpenT3TeamWorkItemDraft } from "~/t3team/chat/t3team-useOpenWorkItemDraft";

export function T3TeamSystemTimelineGenericRow({
  message,
  threadRef,
  markdownCwd,
  showMessageText,
  onSubmitRecipeCardAction,
}: {
  readonly message: ChatMessage;
  readonly threadRef: ScopedThreadRef | null;
  readonly markdownCwd?: string | undefined;
  readonly showMessageText: boolean;
  readonly onSubmitRecipeCardAction?: ChatViewT3TeamExtensionProps["onSubmitRecipeCardAction"];
}) {
  const openWorkItemDraft = useOpenT3TeamWorkItemDraft();
  const workflowCard = getT3TeamWorkflowCardAttachment(message);
  const widgetAttachments = getT3TeamWidgetAttachments(message);
  const genericAttachments = getT3TeamRenderableAttachments(message);
  const hasLeadingContent = showMessageText || Boolean(workflowCard);

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
            className={hasLeadingContent ? "mt-3" : undefined}
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
