import { ListTreeIcon } from "lucide-react";
import type { ReactNode } from "react";

import { APP_DISPLAY_NAME } from "~/t3team/t3team-branding";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";
import {
  useT3TeamInboxAttribution,
  useT3TeamInboxPinnedGitHubActivity,
  useT3TeamInboxWorkItems,
} from "~/t3team/t3team-useInboxWorkItems";
import { InboxPinnedGitHubActivityRows } from "~/t3team/components/t3team-InboxPinnedGitHubActivityRows";
import { InboxWorkItemRows } from "~/t3team/components/t3team-InboxWorkItemRows";
import { ProjectSidebarHeader } from "~/t3team/components/t3team-ProjectSidebarHeader";
import { useT3TeamChildThreadRelations } from "~/t3team/hooks/t3team-useChildThreadRelations";
import { useExpandedSubRunsStore } from "~/t3team/hooks/t3team-useExpandedSubRuns";

/**
 * The only two places T3 Team reaches into upstream's Inbox sidebar.
 *
 * Both render `null` outside the Team shell (and whenever there is nothing to
 * add), so upstream's `SidebarV2` keeps behaving exactly as upstream ships it and
 * the fork diff there stays at two one-line calls — cheap to re-apply on every
 * upstream sync.
 */

/**
 * The Team header, so the Work lens keeps the pack brand and configurable
 * header background instead of dropping to upstream's T3 wordmark. Both lenses
 * therefore render the same chrome — the Team sidebar stays a superset of
 * upstream's rather than losing branding when the lens changes.
 */
export function InboxHeader(): ReactNode {
  const appearance = useT3TeamPackAppearance();
  return (
    <ProjectSidebarHeader
      appearance={appearance}
      appName={appearance?.labels?.appName ?? APP_DISPLAY_NAME}
    />
  );
}

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
 * Muted "N sub-runs" chip for a thread that has sub-runbook child threads
 * (Epic: first-class sub-runbooks). Children themselves are filtered out of
 * the Work-lens row list elsewhere (`t3team-useChildThreadRelations.ts`) and
 * instead render as a compact tree directly below the parent row (Sidebar.tsx)
 * when this chip is expanded — clicking it just toggles that disclosure.
 */
export function InboxSubRunsChip({ threadId }: { threadId: string }): ReactNode {
  const { subRunCountsByParentId } = useT3TeamChildThreadRelations();
  const expanded = useExpandedSubRunsStore((state) => state.expandedParentIds.has(threadId));
  const toggle = useExpandedSubRunsStore((state) => state.toggle);
  const counts = subRunCountsByParentId.get(threadId);
  if (!counts || counts.total === 0) {
    return null;
  }
  const noun = counts.total === 1 ? "sub-run" : "sub-runs";
  const description =
    counts.running > 0
      ? `${counts.total} ${noun} · ${counts.running} active`
      : `${counts.total} ${noun}`;
  return (
    <button
      type="button"
      data-t3team-sub-runs-chip
      aria-expanded={expanded}
      aria-label={description}
      title={description}
      // The chip sits inside the row's own clickable button (see
      // Sidebar.tsx's SidebarThreadRow), same nesting the Settle/Snooze
      // affordances already use there — stopPropagation keeps this toggle
      // from also navigating to the parent thread.
      onClick={(event) => {
        event.stopPropagation();
        toggle(threadId);
      }}
      // Just the count — the row line is already crowded, and the verbose label
      // truncated ("6 sub-runs · 1 acti…"). Detail lives in the tooltip.
      className="flex shrink-0 cursor-pointer items-center gap-0.5 rounded-sm bg-sidebar-control-surface px-1 text-[0.6875rem] font-medium tabular-nums text-sidebar-muted-foreground hover:text-sidebar-foreground"
    >
      <ListTreeIcon aria-hidden className="size-3 shrink-0" />
      {counts.total}
      {counts.running > 0 ? (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
      ) : null}
    </button>
  );
}

/**
 * Assigned or pinned work-item rows, merged into the same activity stream as
 * threads. They are peers of thread rows, never containers above them.
 */
export function InboxWorkItemSection(): ReactNode {
  const workItems = useT3TeamInboxWorkItems();
  const pinnedGitHubActivity = useT3TeamInboxPinnedGitHubActivity();
  if (workItems.length === 0 && pinnedGitHubActivity.length === 0) {
    return null;
  }
  return (
    <>
      <InboxWorkItemRows rows={workItems} />
      <InboxPinnedGitHubActivityRows rows={pinnedGitHubActivity} />
    </>
  );
}
