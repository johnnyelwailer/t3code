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
