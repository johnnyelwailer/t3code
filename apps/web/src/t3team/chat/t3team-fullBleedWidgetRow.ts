/**
 * Which timeline rows `T3TeamSystemTimelineRow` renders full-bleed: a registered `message.view`
 * registered with `layout: "fullBleed"`, and two `T3TeamWidgetBlock` cases — the widget-only case
 * (widget attachment(s), no visible text, no workflow card, no generic attachment) and the
 * trusted-historical-HTML case (system author + workflowRunId + an HTML-looking body, rendered as
 * a widget directly).
 *
 * The `MessagesTimeline` row wrapper must know about this, because only these rows are
 * allowed to span the full thread content width: the wrapper drops the narrow message-column
 * cap (`max-w-3xl`) and its `overflow-x-clip` (which would clamp any descendant) for them,
 * and keeps it for every other row.
 *
 * Pure — no React, no DOM — and mirrors `T3TeamSystemTimelineRow`'s branch order exactly,
 * reusing the same attachment helpers it does, so the wrapper and the row can never
 * disagree about which rows are full-bleed.
 */
import type { ChatMessage } from "~/types";

import {
  getT3TeamRenderableAttachments,
  getT3TeamWidgetAttachments,
} from "./t3team-messageExtViews";
import { findMessageView } from "./t3team-messageViewRegistry";

export function isT3TeamFullBleedWidgetRow(message: ChatMessage): boolean {
  // Branch parity with `T3TeamSystemTimelineRow`: a registered view that owns the row (the host's
  // compact shape and decision cards, a pack view) decides by its own layout, first.
  const rowView = findMessageView(message, "row");
  if (rowView !== null) {
    return rowView.entry.layout === "fullBleed";
  }

  // Trusted historical workflow HTML: the message body itself is the widget payload.
  const author = message.t3teamExt?.author;
  if (
    author?.kind === "system" &&
    author.workflowRunId !== undefined &&
    /<\/?[a-z][^>]*>/i.test(message.text)
  ) {
    return true;
  }

  // Widget-only row: at least one widget attachment, no visible message text (the shape and
  // decision echoes were ruled out above), no workflow card, no generic attachments.
  if (message.text.length > 0) {
    return false;
  }
  return (
    getT3TeamWidgetAttachments(message).length > 0 &&
    findMessageView(message, "card-body") === null &&
    getT3TeamRenderableAttachments(message).length === 0
  );
}
