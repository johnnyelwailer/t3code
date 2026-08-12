import {
  filterHiddenSidebarItemsById,
  sortSidebarItemsByStoredOrderById,
} from "~/t3team/t3team-sidebarNavPreferences";
import {
  buildGitHubActivitySidebarPinnedItemId,
  buildTicketSidebarPinnedItemId,
  type T3TeamSidebarPinnedItem,
} from "~/t3team/t3team-sidebarPinningTypes";
import type { ProjectThread, ProjectTicket } from "~/t3team/t3team-types";

/**
 * Pure selection and ordering for the Team context layered into upstream's Inbox
 * (doc 40, phase 1). Kept free of React and of upstream's thread model so it can
 * be asserted directly, and so upstream's sidebar only ever calls into a tiny slot.
 *
 * Two things are produced:
 * - `resolveInboxAttribution` — the compact work-item label shown on a thread row.
 * - `selectInboxWorkItems` — the optional work-item rows: assigned to the viewer,
 *   or explicitly pinned. Work items are never hierarchy parents; they are peers in
 *   the same activity stream.
 */

export interface InboxWorkItemAttribution {
  readonly ticketId: string;
  readonly displayId: string;
  readonly title: string;
  readonly url: string | null;
}

export interface InboxWorkItemRow extends InboxWorkItemAttribution {
  readonly projectId: string;
  /** Why the row is in the Inbox at all — drives ordering ties and the tooltip. */
  readonly reason: "assigned" | "pinned";
  /** Latest activity across the work item and its descendant threads, ISO. */
  readonly lastActivityAt: string;
  /** Count of descendant threads that have an associated pull request. */
  readonly pullRequestCount: number;
}

function toAttribution(ticket: ProjectTicket): InboxWorkItemAttribution {
  return {
    ticketId: ticket.id,
    displayId: ticket.ref.displayId,
    title: ticket.ref.title,
    url: ticket.ref.url || null,
  };
}

/**
 * A thread carries its own `ticketDisplayId` once kicked off from a work item, but
 * the ticket record is the source of truth for the title and link, so prefer it and
 * fall back to the denormalised id while tickets are still loading.
 */
export function resolveInboxAttribution(input: {
  readonly thread: Pick<ProjectThread, "ticketId" | "ticketDisplayId">;
  readonly ticketsById: ReadonlyMap<string, ProjectTicket>;
}): InboxWorkItemAttribution | null {
  const { thread, ticketsById } = input;
  if (!thread.ticketId) {
    return null;
  }
  const ticket = ticketsById.get(thread.ticketId);
  if (ticket) {
    return toAttribution(ticket);
  }
  return thread.ticketDisplayId
    ? {
        ticketId: thread.ticketId,
        displayId: thread.ticketDisplayId,
        title: "",
        url: null,
      }
    : null;
}

function latestActivity(values: ReadonlyArray<string>): string {
  return values.reduce((latest, value) => (value > latest ? value : latest), "");
}

export function selectInboxWorkItems(input: {
  readonly tickets: ReadonlyArray<ProjectTicket>;
  readonly threads: ReadonlyArray<ProjectThread>;
  readonly pinnedTicketIds: ReadonlySet<string>;
  /** Atlassian account id of the viewer; `null` disables the assigned reason. */
  readonly viewerAccountId: string | null;
  readonly threadHasPullRequest: (threadId: string) => boolean;
  /**
   * Sidebar-nav preferences, flattened across projects. Item ids are already project-scoped
   * (`<projectId>:jira-work-item:<ticketId>`), so a flat set cannot collide — which is what lets
   * one cross-project stream honour preferences the Code lens stores per project.
   */
  readonly hiddenSidebarItemIds?: ReadonlyArray<string>;
  readonly orderedSidebarItemIds?: ReadonlyArray<string>;
}): ReadonlyArray<InboxWorkItemRow> {
  const {
    tickets,
    threads,
    pinnedTicketIds,
    viewerAccountId,
    threadHasPullRequest,
    hiddenSidebarItemIds = [],
    orderedSidebarItemIds = [],
  } = input;

  const threadsByTicketId = new Map<string, ProjectThread[]>();
  for (const thread of threads) {
    if (!thread.ticketId) continue;
    const bucket = threadsByTicketId.get(thread.ticketId);
    if (bucket) bucket.push(thread);
    else threadsByTicketId.set(thread.ticketId, [thread]);
  }

  const rows: InboxWorkItemRow[] = [];
  for (const ticket of tickets) {
    const pinned = pinnedTicketIds.has(ticket.id);
    const assigned =
      viewerAccountId !== null &&
      ticket.assigneeAccountId !== undefined &&
      ticket.assigneeAccountId === viewerAccountId;
    if (!pinned && !assigned) {
      continue;
    }

    const descendants = threadsByTicketId.get(ticket.id) ?? [];
    rows.push({
      ...toAttribution(ticket),
      projectId: ticket.projectId,
      // Pinning is an explicit user act, so it wins the label when both apply.
      reason: pinned ? "pinned" : "assigned",
      lastActivityAt: latestActivity(descendants.map((thread) => thread.lastMessageAt)),
      pullRequestCount: descendants.filter((thread) => threadHasPullRequest(thread.id)).length,
    });
  }

  // Most recent descendant activity first; work items with no activity yet sort last
  // but stay visible, and ties fall back to display id so ordering is stable.
  rows.sort(
    (left, right) =>
      right.lastActivityAt.localeCompare(left.lastActivityAt) ||
      left.displayId.localeCompare(right.displayId),
  );

  // Then let the user's own arrangement win over recency. "Hide from sidebar" and "show at top"
  // are explicit acts; activity ordering is only the default for items the user never touched.
  // `sortSidebarItemsByStoredOrderById` is a stable sort that floats ordered ids to the front and
  // leaves everything else in the activity order computed above.
  const sidebarItemIdOf = (row: InboxWorkItemRow) =>
    buildTicketSidebarPinnedItemId({ projectId: row.projectId, ticketId: row.ticketId });

  return sortSidebarItemsByStoredOrderById(
    filterHiddenSidebarItemsById(rows, hiddenSidebarItemIds, sidebarItemIdOf),
    orderedSidebarItemIds,
    sidebarItemIdOf,
  );
}

/**
 * A pinned `github-activity` item, ready for the Work-lens Inbox to resolve against a project's
 * live activity feed. Kept separate from `InboxWorkItemRow`: GitHub activity has no ticket record
 * to key off of the way jira pins do, so resolving title/repo/url needs a per-project fetch
 * (`useProjectGitHubActivity`) rather than the flat ticket lookup `selectInboxWorkItems` uses —
 * `t3team-InboxPinnedGitHubActivityRows.tsx` does that fetch once per project and matches these
 * ids against it.
 */
export interface InboxGitHubActivityPinRow {
  readonly id: string;
  readonly projectId: string;
  readonly activityId: string;
  readonly pinnedAt: string;
}

export function selectInboxPinnedGitHubActivity(input: {
  readonly pinnedItems: ReadonlyArray<T3TeamSidebarPinnedItem>;
  readonly hiddenSidebarItemIds?: ReadonlyArray<string>;
  readonly orderedSidebarItemIds?: ReadonlyArray<string>;
}): ReadonlyArray<InboxGitHubActivityPinRow> {
  const { pinnedItems, hiddenSidebarItemIds = [], orderedSidebarItemIds = [] } = input;

  const rows: InboxGitHubActivityPinRow[] = pinnedItems
    .filter(
      (item): item is Extract<T3TeamSidebarPinnedItem, { kind: "github-activity" }> =>
        item.kind === "github-activity",
    )
    .map((item) => ({
      id: buildGitHubActivitySidebarPinnedItemId({
        projectId: item.projectId,
        activityId: item.activityId,
      }),
      projectId: item.projectId,
      activityId: item.activityId,
      pinnedAt: item.pinnedAt,
    }));

  const sidebarItemIdOf = (row: InboxGitHubActivityPinRow) => row.id;

  return sortSidebarItemsByStoredOrderById(
    filterHiddenSidebarItemsById(rows, hiddenSidebarItemIds, sidebarItemIdOf),
    orderedSidebarItemIds,
    sidebarItemIdOf,
  );
}
