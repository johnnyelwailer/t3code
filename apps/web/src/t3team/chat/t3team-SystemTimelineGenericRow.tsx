/**
 * The generic system-notice card — the fallback of the three mutually exclusive shapes
 * `T3TeamSystemTimelineRow` can take (sibling of `T3TeamSystemTimelineShapeRow` and
 * `T3TeamSystemTimelineDecisionRow`), split out to keep that file under the prefixed-file LOC
 * ceiling. It re-derives its own attachments from the message — pure getters — so the parent
 * hands it only its own props and the one flag (`showMessageText`) that depends on sibling-shape
 * checks it already made. A registered `card-body` view (the host's workflow card) renders after
 * the message text.
 */
import ChatMarkdown from "~/components/ChatMarkdown";
import {
  getT3TeamRenderableAttachments,
  getT3TeamWidgetAttachments,
  T3TeamMessageAttachmentList,
} from "~/t3team/chat/t3team-messageExtViews";
import { findMessageView } from "~/t3team/chat/t3team-messageViewRegistry";
import type { T3TeamSystemTimelineRowProps } from "~/t3team/chat/t3team-SystemTimelineRow";
import { T3TeamWidgetBlock } from "~/t3team/chat/t3team-widgetBlock";
import { useOpenT3TeamWorkItemDraft } from "~/t3team/chat/t3team-useOpenWorkItemDraft";

export function T3TeamSystemTimelineGenericRow({
  row,
  showMessageText,
}: {
  readonly row: T3TeamSystemTimelineRowProps;
  readonly showMessageText: boolean;
}) {
  const { message, threadRef, markdownCwd } = row;
  const openWorkItemDraft = useOpenT3TeamWorkItemDraft();
  const cardBody = findMessageView(message, "card-body");
  const widgetAttachments = getT3TeamWidgetAttachments(message);
  const genericAttachments = getT3TeamRenderableAttachments(message);
  const hasLeadingContent = showMessageText || cardBody !== null;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[92%] rounded-2xl border border-border/70 bg-muted/25 px-4 py-3">
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
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
        {cardBody ? (
          <div className={showMessageText ? "mt-3" : undefined}>
            {cardBody.render({ threadRef, messageId: message.id, row })}
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
