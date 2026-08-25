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
 * on expand; the user only wants the most recent active ones up front. Mirrors the Agents
 * panel fork section's cap (t3team-AgentsPanelSubRunTree.tsx).
 */
export const SIDEBAR_SUB_RUN_LIMIT = 10;

export type SubRunPage = {
  readonly visible: ProjectThread[];
  readonly hiddenCount: number;
};

/**
 * Sort a parent's sub-run threads newest-to-oldest (most recently active first) and page them:
 * the first {@link SIDEBAR_SUB_RUN_LIMIT} when `showAll` is false, or all of them when true.
 * `hiddenCount` is how many sit behind the "Show more" disclosure (0 when `showAll` or within
 * the limit). Pure so the sidebar's expand/cap behavior is unit-testable without rendering the
 * whole component.
 */
export function pageSubRunThreads(
  threads: ReadonlyArray<ProjectThread>,
  showAll: boolean,
): SubRunPage {
  const sorted = [...threads].sort(
    (a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt),
  );
  const visible = showAll ? sorted : sorted.slice(0, SIDEBAR_SUB_RUN_LIMIT);
  return { visible, hiddenCount: sorted.length - visible.length };
}
