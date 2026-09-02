/**
 * Collapse affordance for long workflow-authored system notifications — the plain-text
 * `thread.notifyUser(...)` path (see `t3team-workflowEngineBrokerNotify.ts`, the `p.recipient ===
 * "user"` non-HTML branch). Mirrors `CollapsibleUserMessageBody` in `MessagesTimeline.tsx`: same
 * thresholds, same fade mask, same expand-button copy, reused via `t3team-collapsibleMessage.ts`
 * rather than re-derived.
 *
 * Scoped narrowly: this only backs the bare-text `workflowNotification` branch of
 * `T3TeamSystemTimelineRow` (a workflow-authored system message with no workflow card, no widget,
 * no generic attachment). Decision cards, shape cards, widget attachments, and the generic
 * system-notice card (`T3TeamSystemTimelineGenericRow`) render elsewhere and are untouched.
 *
 * The whole message is always rendered — collapsing is a CSS max-height + mask clip over the full
 * markdown output, never a truncated/re-derived string — so expanding never re-fetches or
 * re-renders different content, and the report's first line (usually its verdict) is never cut
 * mid-word. Leading whitespace is trimmed first so that first line isn't pushed out of the clipped
 * viewport by a blank line.
 */
import { useState } from "react";
import type { ScopedThreadRef } from "@t3tools/contracts";

import ChatMarkdown from "~/components/ChatMarkdown";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  COLLAPSED_MESSAGE_FADE_MASK,
  shouldCollapseMessageText,
} from "~/t3team/chat/t3team-collapsibleMessage";

export function T3TeamSystemTimelineNotificationBody({
  text,
  threadRef,
  markdownCwd,
}: {
  readonly text: string;
  readonly threadRef: ScopedThreadRef | null;
  readonly markdownCwd?: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const trimmedText = text.trimStart();
  const canCollapse = shouldCollapseMessageText(trimmedText);
  const isCollapsed = canCollapse && !expanded;

  return (
    <div className="max-w-[92%]">
      <div
        className={cn(
          "relative text-sm leading-6 text-foreground/90",
          isCollapsed && "max-h-44 overflow-hidden",
        )}
        data-workflow-notification-collapsed={isCollapsed ? "true" : "false"}
        data-workflow-notification-collapsible={canCollapse ? "true" : "false"}
        data-workflow-notification-fade={isCollapsed ? "true" : "false"}
        style={
          isCollapsed
            ? { WebkitMaskImage: COLLAPSED_MESSAGE_FADE_MASK, maskImage: COLLAPSED_MESSAGE_FADE_MASK }
            : undefined
        }
      >
        <ChatMarkdown text={trimmedText} cwd={markdownCwd} threadRef={threadRef ?? undefined} />
      </div>
      {canCollapse ? (
        <div className="mt-1.5 flex justify-start" data-workflow-notification-footer="true">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-expanded={expanded}
            data-scroll-anchor-ignore
            onClick={() => setExpanded((value) => !value)}
            className="-ml-1 h-6 rounded-md px-1.5 text-secondary-label text-xs hover:bg-muted/55 hover:text-message-foreground"
          >
            {expanded ? "Show less" : "Show full message"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
