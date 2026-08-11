import { useRef } from "react";

import { buildProjectSidebarThreadTree } from "~/t3team/components/t3team-projectSidebarThreadTree";
import type { ProjectThread } from "~/t3team/t3team-types";
import { useProjectStore } from "./t3team-useProjectStore";

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
 * Cheap content signature over exactly the fields `buildChildThreadRelations`
 * reads (id, parentThreadId, status, title, lastMessageAt) — NOT the array
 * identity of `threads` itself, which upstream re-creates on every
 * `useProjectStore()` update (including plain thread selection). Order-
 * independent (sorted by id) so re-fetching the same threads in a different
 * order still signs identically.
 */
export function computeChildThreadRelationsSignature(
  threads: ReadonlyArray<ProjectThread>,
): string {
  return threads
    .map(
      (thread) =>
        `${thread.id}:${thread.parentThreadId ?? ""}:${thread.status}:${thread.title}:${thread.lastMessageAt}`,
    )
    .sort()
    .join("|");
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
 */
export function createChildThreadRelationsMemo(): (
  threads: ReadonlyArray<ProjectThread>,
) => ChildThreadRelations {
  let cache: { signature: string; relations: ChildThreadRelations } | null = null;
  return (threads: ReadonlyArray<ProjectThread>): ChildThreadRelations => {
    const signature = computeChildThreadRelationsSignature(threads);
    if (!cache || cache.signature !== signature) {
      cache = { signature, relations: buildChildThreadRelations(threads) };
    }
    return cache.relations;
  };
}

/**
 * React binding for `buildChildThreadRelations`. Calls `useProjectStore()`
 * independently — the same pattern `t3team-useInboxWorkItems.ts` already uses to
 * read Team thread/project state from inside upstream's Inbox sidebar without
 * prop-drilling it down from `t3team-App.tsx`.
 *
 * Kept referentially stable via `createChildThreadRelationsMemo` — see that
 * function's comment for why (upstream's Sidebar.tsx depends on the result
 * in a `useMemo`, and array-identity churn there caused a visible sidebar
 * reflow on every thread selection).
 */
export function useT3TeamChildThreadRelations(): ChildThreadRelations {
  const { threads } = useProjectStore();
  const memoRef = useRef<((threads: ReadonlyArray<ProjectThread>) => ChildThreadRelations) | null>(
    null,
  );
  if (!memoRef.current) {
    memoRef.current = createChildThreadRelationsMemo();
  }
  return memoRef.current(threads);
}
