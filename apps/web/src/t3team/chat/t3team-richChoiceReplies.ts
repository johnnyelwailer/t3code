import {
  deriveRichChoiceCardStatesFromEvents,
  type RichChoiceCardState,
  type RichChoiceThreadEvent,
} from "@t3tools/shared/t3team-richChoiceCardState";

import { getT3TeamWidgetAttachments } from "~/t3team/chat/t3team-messageExtViews";
import type { ChatMessage } from "~/types";

export type { RichChoiceCardState };

type TimelineEntryLike = { readonly kind: string; readonly message?: ChatMessage };

function* threadEvents(
  entries: ReadonlyArray<TimelineEntryLike>,
): Generator<RichChoiceThreadEvent> {
  for (const entry of entries) {
    const message = entry.message;
    if (entry.kind !== "message" || !message) continue;
    for (const { widget } of getT3TeamWidgetAttachments(message)) {
      if (widget.format !== "rich-choice") continue;
      yield { kind: "card", widgetId: widget.widgetId, html: widget.html };
    }
    if (message.role !== "user") continue;
    yield {
      kind: "user-message",
      text: message.text,
      widgetReplyId: message.t3teamExt?.widgetReply?.widgetId,
    };
  }
}

/**
 * Card states derived from the thread, so they survive remounts and reloads. The rules (first
 * action answers, a later card or typed message supersedes) are shared with mobile.
 */
export function deriveRichChoiceCardStates(
  entries: ReadonlyArray<TimelineEntryLike>,
): ReadonlyMap<string, RichChoiceCardState> {
  return deriveRichChoiceCardStatesFromEvents(threadEvents(entries));
}
