import { buildProjectSidebarThreadTree } from "~/t3team/components/t3team-projectSidebarThreadTree";
import {
  resolveInboxAttribution,
  type InboxWorkItemAttribution,
} from "~/t3team/t3team-inboxWorkItems";
import type { ProjectThread, ProjectTicket } from "~/t3team/t3team-types";

export type SubRunCounts = {
  readonly total: number;
  readonly running: number;
};

export type ChildThreadRelations = {
  /** Ids of every thread that is some other thread's child (globally, across projects). */
  readonly childThreadIds: ReadonlySet<string>;
  /** Sub-run counts keyed by PARENT thread id. Absent when a thread has no children. */
  readonly subRunCountsByParentId: ReadonlyMap<string, SubRunCounts>;
  /**
   * The child threads themselves, keyed by PARENT thread id, in the same
   * order `buildProjectSidebarThreadTree` collected them. Lets the sidebar
   * render a parent's children inline (compact rows) when its sub-runs chip
   * is expanded, instead of only knowing the count.
   */
  readonly childThreadsByParentId: ReadonlyMap<string, ReadonlyArray<ProjectThread>>;
};

/**
 * Pure derivation of the parent/child thread relation the Work-lens sidebar needs
 * to hide child rows and show a "N sub-runs" chip on the parent. Reuses
 * `buildProjectSidebarThreadTree`'s rule for what counts as a child — a thread is
 * only ever treated as a child when its `parentThreadId` resolves to another
 * thread IN THE SAME INPUT SET, so a child whose parent is missing/unknown never
 * gets orphan-hidden (it just falls out as a root in the tree, and this function
 * doesn't add it to `childThreadIds`).
 */
export function buildChildThreadRelations(
  threads: ReadonlyArray<ProjectThread>,
): ChildThreadRelations {
  const tree = buildProjectSidebarThreadTree(threads);
  const childThreadIds = new Set<string>();
  const subRunCountsByParentId = new Map<string, SubRunCounts>();

  for (const [parentId, children] of tree.childThreadsByParentId) {
    let running = 0;
    for (const child of children) {
      childThreadIds.add(child.id);
      if (child.status === "running") {
        running++;
      }
    }
    subRunCountsByParentId.set(parentId, { total: children.length, running });
  }

  return {
    childThreadIds,
    subRunCountsByParentId,
    childThreadsByParentId: tree.childThreadsByParentId,
  };
}

/**
 * Cheap content signature over the fields that `buildChildThreadRelations` AND
 * `buildAttributionByThreadId` read: id, parentThreadId, status, title,
 * lastMessageAt, ticketId, ticketDisplayId. NOT the array identity of `threads`
 * itself, which upstream re-creates on every `useProjectStore()` update
 * (including plain thread selection). Order-independent (sorted by id) so
 * re-fetching the same threads in a different order signs identically.
 */
export function computeChildThreadRelationsSignature(
  threads: ReadonlyArray<ProjectThread>,
): string {
  return threads
    .map(
      (thread) =>
        `${thread.id}:${thread.parentThreadId ?? ""}:${thread.status}:${thread.title}:${thread.lastMessageAt}:${thread.ticketId ?? ""}:${thread.ticketDisplayId ?? ""}`,
    )
    .sort()
    .join("|");
}

/**
 * Derives the attribution label for every thread in one pass over `threads`.
 * Returns a stable map: if no thread has attribution the same empty-map
 * constant is returned each call to avoid downstream memo churn.
 */
export const EMPTY_ATTRIBUTION_MAP: ReadonlyMap<string, InboxWorkItemAttribution | null> =
  new Map();

export function buildAttributionByThreadId(
  threads: ReadonlyArray<ProjectThread>,
  ticketsById: ReadonlyMap<string, ProjectTicket>,
): ReadonlyMap<string, InboxWorkItemAttribution | null> {
  // Fast path: no thread has a ticketId — avoids allocating a Map at all.
  if (!threads.some((t) => t.ticketId)) {
    return EMPTY_ATTRIBUTION_MAP;
  }
  const map = new Map<string, InboxWorkItemAttribution | null>();
  for (const thread of threads) {
    if (thread.ticketId) {
      map.set(thread.id, resolveInboxAttribution({ thread, ticketsById }));
    }
  }
  return map;
}

/**
 * Creates a single-slot memo that returns the SAME `ChildThreadRelations`
 * object across calls whose input threads sign identically, even when the
 * `threads` array itself is a fresh identity. Without this, every thread
 * selection (which re-creates `useProjectStore()`'s `threads` array) would
 * hand Sidebar.tsx's big classification `useMemo` a new `childThreadIds` Set
 * on every render, invalidating it and re-materializing the whole pinned/
 * active/settled partition — visible as the sidebar shifting/re-animating on
 * every click.
 *
 * The memo also computes `attributionByThreadId` in the same pass so the
 * signature check covers both outputs simultaneously — a single thread-click
 * that changes no parent/child relation and no attribution never recomputes
 * either map.
 */
export function createChildThreadRelationsMemo(): (
  threads: ReadonlyArray<ProjectThread>,
  ticketsById: ReadonlyMap<string, ProjectTicket>,
) => {
  relations: ChildThreadRelations;
  attributionByThreadId: ReadonlyMap<string, InboxWorkItemAttribution | null>;
} {
  let cache: {
    signature: string;
    relations: ChildThreadRelations;
    attributionByThreadId: ReadonlyMap<string, InboxWorkItemAttribution | null>;
  } | null = null;
  return (threads, ticketsById) => {
    const signature = computeChildThreadRelationsSignature(threads);
    if (!cache || cache.signature !== signature) {
      cache = {
        signature,
        relations: buildChildThreadRelations(threads),
        attributionByThreadId: buildAttributionByThreadId(threads, ticketsById),
      };
    }
    return cache;
  };
}
