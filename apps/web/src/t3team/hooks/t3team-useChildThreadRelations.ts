import { useMemo } from "react";

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

  return { childThreadIds, subRunCountsByParentId };
}

/**
 * React binding for `buildChildThreadRelations`. Calls `useProjectStore()`
 * independently — the same pattern `t3team-useInboxWorkItems.ts` already uses to
 * read Team thread/project state from inside upstream's Inbox sidebar without
 * prop-drilling it down from `t3team-App.tsx`.
 */
export function useT3TeamChildThreadRelations(): ChildThreadRelations {
  const { threads } = useProjectStore();
  return useMemo(() => buildChildThreadRelations(threads), [threads]);
}
