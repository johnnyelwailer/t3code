/**
 * Which timeline rows `T3TeamSystemTimelineRow` renders as a full-bleed `T3TeamWidgetBlock`:
 * the widget-only case (widget attachment(s), no visible text, no workflow card, no generic
 * attachment) and the trusted-historical-HTML case (system author + workflowRunId + an
 * HTML-looking body, rendered as a widget directly).
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
  getT3TeamWorkflowCardAttachment,
} from "./t3team-messageExtViews";
import { getT3TeamWorkflowShapeAttachment } from "./t3team-messageShapeCard";
import { getT3TeamWorkflowDecisionAttachment } from "./t3team-workflowDecisionAnswers";

export function isT3TeamFullBleedWidgetRow(message: ChatMessage): boolean {
  // Branch parity with `T3TeamSystemTimelineRow`: shape and decision cards own their own
  // compact rows and never render a widget, so they short-circuit to false first.
  if (getT3TeamWorkflowShapeAttachment(message) !== null) {
    return false;
  }
  if (getT3TeamWorkflowDecisionAttachment(message) !== null) {
    return false;
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
    getT3TeamWorkflowCardAttachment(message) === null &&
    getT3TeamRenderableAttachments(message).length === 0
  );
}
