import {
  parseRichChoicePayload,
  parseRichChoicePickIds,
  type RichChoicePayload,
} from "@t3tools/shared/t3team-richChoicePayload";

import { getT3TeamWidgetAttachments } from "~/t3team/chat/t3team-messageExtViews";
import type { ChatMessage } from "~/types";

export type RichChoiceCardState =
  | { readonly status: "open" }
  | { readonly status: "answered"; readonly pickedIds: ReadonlyArray<string> }
  /** A newer rich-choice card or a typed user message came after this card. */
  | { readonly status: "stale" };

type TimelineEntryLike = { readonly kind: string; readonly message?: ChatMessage };

/**
 * Card states derived from the thread, so they survive remounts and reloads. The first widget
 * action for a card answers it (a replay never changes the answer); a later rich-choice card or
 * any typed user message supersedes a card that is still open.
 */
export function deriveRichChoiceCardStates(
  entries: ReadonlyArray<TimelineEntryLike>,
): ReadonlyMap<string, RichChoiceCardState> {
  const states = new Map<string, RichChoiceCardState>();
  const payloads = new Map<string, RichChoicePayload>();
  const supersedeOpen = () => {
    for (const [id, state] of states)
      if (state.status === "open") states.set(id, { status: "stale" });
  };
  for (const entry of entries) {
    const message = entry.message;
    if (entry.kind !== "message" || !message) continue;
    for (const { widget } of getT3TeamWidgetAttachments(message)) {
      if (widget.format !== "rich-choice") continue;
      const parsed = safeParse(widget.html);
      if (!parsed) continue;
      supersedeOpen();
      payloads.set(widget.widgetId, parsed);
      states.set(widget.widgetId, { status: "open" });
    }
    if (message.role !== "user") continue;
    const reply = message.t3teamExt?.widgetReply;
    if (!reply) {
      supersedeOpen();
      continue;
    }
    const payload = payloads.get(reply.widgetId);
    if (!payload || states.get(reply.widgetId)?.status !== "open") continue;
    const pickedIds = parseRichChoicePickIds(payload, message.text);
    if (pickedIds) states.set(reply.widgetId, { status: "answered", pickedIds });
  }
  return states;
}

function safeParse(html: string): RichChoicePayload | null {
  try {
    const parsed = parseRichChoicePayload(JSON.parse(html));
    return parsed.ok ? parsed.payload : null;
  } catch {
    return null;
  }
}
