import type { ProjectThread } from "~/t3team/t3team-types";

export type ProjectSidebarThreadTree = {
  rootThreads: ProjectThread[];
  childThreadsByParentId: Map<string, ProjectThread[]>;
};

export function buildProjectSidebarThreadTree(
  threads: ReadonlyArray<ProjectThread>,
): ProjectSidebarThreadTree {
  const threadIds = new Set(threads.map((thread) => thread.id));
  const rootThreads: ProjectThread[] = [];
  const childThreadsByParentId = new Map<string, ProjectThread[]>();

  for (const thread of threads) {
    if (
      thread.parentThreadId &&
      thread.parentThreadId !== thread.id &&
      threadIds.has(thread.parentThreadId)
    ) {
      const existingChildren = childThreadsByParentId.get(thread.parentThreadId) ?? [];
      existingChildren.push(thread);
      childThreadsByParentId.set(thread.parentThreadId, existingChildren);
      continue;
    }

    rootThreads.push(thread);
  }

  return {
    rootThreads,
    childThreadsByParentId,
  };
}

export function countProjectSidebarThreadBranches(
  roots: ReadonlyArray<ProjectThread>,
  tree: ProjectSidebarThreadTree,
): number {
  const visited = new Set<string>();
  const visit = (thread: ProjectThread): void => {
    if (visited.has(thread.id)) return;
    visited.add(thread.id);
    for (const child of tree.childThreadsByParentId.get(thread.id) ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  return visited.size;
}

/**
 * How many sub-run rows render at once in the sidebar before a "Show more" disclosure. A
 * coordinator with a large child fleet (dozens of sub-runs) would otherwise flood the sidebar
 * on expand; the user only wants the active ones up front. Mirrors the Agents panel fork
 * section's cap (t3team-AgentsPanelSubRunTree.tsx).
 */
export const SIDEBAR_SUB_RUN_LIMIT = 10;

export type SubRunPage = {
  readonly visible: ProjectThread[];
  readonly hiddenCount: number;
};

/**
 * Stable sub-run ordering, shared by the sidebar sub-run list and the Agents panel sub-run
 * tree: activity NEVER reorders the list — the same documented rule as
 * `sortThreadsForSidebar` for main threads, where a row holds its position from open until
 * settled and the screen only moves at lifecycle transitions. Sorting by live `lastMessageAt`
 * reshuffled the list on every message while children ran; `lastMessageAt` still labels the
 * row, it just never ranks it.
 *
 * Grouped by lifecycle — running/active first, then waiting (error), then idle, then settled
 * (completed) — and within each group by `createdAt` newest-first (newest child on top, like
 * the main thread list) with an `id` tiebreak, so equal timestamps can never flip two rows.
 */
export const SUB_RUN_LIFECYCLE_RANK: Record<ProjectThread["status"], number> = {
  running: 0,
  error: 1,
  idle: 2,
  completed: 3,
};

export function compareSubRunThreads(
  a: Pick<ProjectThread, "id" | "createdAt" | "status">,
  b: Pick<ProjectThread, "id" | "createdAt" | "status">,
): number {
  return (
    SUB_RUN_LIFECYCLE_RANK[a.status] - SUB_RUN_LIFECYCLE_RANK[b.status] ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

export function sortSubRunThreads<
  T extends Pick<ProjectThread, "id" | "createdAt" | "status">,
>(threads: readonly T[]): T[] {
  return threads.toSorted(compareSubRunThreads);
}

/**
 * Order a parent's sub-run threads with {@link compareSubRunThreads} (stable lifecycle +
 * createdAt order) and page them: the first {@link SIDEBAR_SUB_RUN_LIMIT} when `showAll`
 * is false, or all of them when true. `hiddenCount` is how many sit behind the "Show more"
 * disclosure (0 when `showAll` or within the limit). Pure so the sidebar's expand/cap
 * behavior is unit-testable without rendering the whole component.
 */
export function pageSubRunThreads(
  threads: ReadonlyArray<ProjectThread>,
  showAll: boolean,
): SubRunPage {
  const sorted = sortSubRunThreads(threads);
  const visible = showAll ? sorted : sorted.slice(0, SIDEBAR_SUB_RUN_LIMIT);
  return { visible, hiddenCount: sorted.length - visible.length };
}
