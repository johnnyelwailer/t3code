/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import { ListTreeIcon } from "lucide-react";
import type { ReactNode } from "react";

import { APP_DISPLAY_NAME } from "~/t3team/t3team-branding";
import { resolveActivityStatePill } from "~/t3team/t3team-activityStateDisplay";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";
import {
  useT3TeamInboxPinnedGitHubActivity,
  useT3TeamInboxWorkItems,
} from "~/t3team/t3team-useInboxWorkItems";
import { InboxPinnedGitHubActivityRows } from "~/t3team/components/t3team-InboxPinnedGitHubActivityRows";
import { InboxWorkItemRows } from "~/t3team/components/t3team-InboxWorkItemRows";
import { ProjectSidebarHeader } from "~/t3team/components/t3team-ProjectSidebarHeader";
import { useExpandedSubRunsStore } from "~/t3team/hooks/t3team-useExpandedSubRuns";
import { useT3TeamSidebarThreadDataStore } from "~/t3team/t3team-sidebarThreadDataStore";

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

/**
 * Compact work-item attribution on a thread row. Doc 40: attribution, not hierarchy.
 *
 * Reads from `t3team-sidebarThreadDataStore` — a mirror populated by
 * `useT3TeamSidebarThreadMeta()` in `Sidebar.tsx`. This avoids a per-row
 * `useProjectStore()` subscription that would re-render every visible thread row
 * on every thread click (measured at ~2.4 s per click with ~64 rows).
 */
export function InboxThreadAttribution({ threadId }: { threadId: string }): ReactNode {
  const attribution = useT3TeamSidebarThreadDataStore(
    (s) => s.attributionByThreadId.get(threadId) ?? null,
  );
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
 *
 * Reads from `t3team-sidebarThreadDataStore` — a mirror populated by
 * `useT3TeamSidebarThreadMeta()` in `Sidebar.tsx`. This avoids a per-row
 * `useProjectStore()` subscription (see `InboxThreadAttribution` for the full
 * rationale).
 */
export function InboxSubRunsChip({ threadId }: { threadId: string }): ReactNode {
  const counts = useT3TeamSidebarThreadDataStore(
    (s) => s.subRunCountsByParentId.get(threadId) ?? null,
  );
  const expanded = useExpandedSubRunsStore((state) => state.expandedParentIds.has(threadId));
  const toggle = useExpandedSubRunsStore((state) => state.toggle);
  // Three states, one handle: running > 0 → the ACTIVE count chip (settled
  // children belong to the #304 "Settled (N)" fold, not the count); running = 0
  // with total > 0 → a MUTED "Settled N" chip — without it the section's
  // persisted/auto-set expanded state left the #304 fold row under the row
  // forever with nothing to collapse it (sidebar-row refine, 2026-08-30);
  // total = 0 / unknown → nothing (no stale total, no "0").
  if (!counts || counts.total === 0) {
    return null;
  }
  const active = counts.running > 0;
  const settledCount = counts.total - counts.running;
  const noun = (n: number) => (n === 1 ? "sub-run" : "sub-runs");
  const description = active
    ? `${counts.running} active ${noun(counts.running)}${settledCount > 0 ? ` · ${settledCount} settled` : ""}`
    : `Settled ${settledCount} ${noun(settledCount)}`;
  const chipClass = active
    ? "flex shrink-0 cursor-pointer items-center gap-0.5 rounded-sm bg-sidebar-control-surface px-1 text-[0.6875rem] font-medium tabular-nums text-sidebar-muted-foreground hover:text-sidebar-foreground"
    : "flex shrink-0 cursor-pointer items-center gap-0.5 rounded-sm bg-sidebar-control-surface px-1 text-[0.6875rem] font-medium tabular-nums text-sidebar-muted-foreground/60 hover:text-sidebar-muted-foreground/90";
  return (
    <button
      type="button"
      data-t3team-sub-runs-chip
      data-t3team-sub-runs-chip-state={active ? "active" : "settled"}
      aria-expanded={expanded}
      aria-label={description}
      title={description}
      // The chip sits inside the row's own clickable button (see
      // Sidebar.tsx's SidebarThreadRow) — stopPropagation keeps this toggle
      // from also navigating to the parent thread.
      onClick={(event) => {
        event.stopPropagation();
        toggle(threadId);
      }}
      className={chipClass}
    >
      <ListTreeIcon aria-hidden className="size-3 shrink-0" />
      {active ? (
        <>
          {counts.running}
          {/* sky = the working row's "in motion" 4-state color, not the theme's primary accent */}
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${resolveActivityStatePill("working").dotClass}`}
          />
        </>
      ) : (
        <span>Settled {settledCount}</span>
      )}
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
