import type { ReactNode } from "react";

import { useT3TeamInboxAttribution, useT3TeamInboxWorkItems } from "~/t3team/t3team-useInboxWorkItems";
import { InboxWorkItemRows } from "~/t3team/components/t3team-InboxWorkItemRows";

/**
 * The only two places T3 Team reaches into upstream's Inbox sidebar.
 *
 * Both render `null` outside the Team shell (and whenever there is nothing to
 * add), so upstream's `SidebarV2` keeps behaving exactly as upstream ships it and
 * the fork diff there stays at two one-line calls — cheap to re-apply on every
 * upstream sync.
 */

/** Compact work-item attribution on a thread row. Doc 40: attribution, not hierarchy. */
export function InboxThreadAttribution({ threadId }: { threadId: string }): ReactNode {
  const attribution = useT3TeamInboxAttribution(threadId);
  if (!attribution) {
    return null;
  }
  return (
    <span
      data-t3team-inbox-attribution
      title={attribution.title || attribution.displayId}
      className="shrink-0 truncate rounded-sm bg-sidebar-control-surface px-1 text-[0.6875rem] font-medium text-sidebar-muted-foreground"
    >
      {attribution.displayId}
    </span>
  );
}

/**
 * Assigned or pinned work-item rows, merged into the same activity stream as
 * threads. They are peers of thread rows, never containers above them.
 */
export function InboxWorkItemSection(): ReactNode {
  const workItems = useT3TeamInboxWorkItems();
  if (workItems.length === 0) {
    return null;
  }
  return <InboxWorkItemRows rows={workItems} />;
}
