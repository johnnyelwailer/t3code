/**
 * Pure logic for the t3team Agents panel sub-runs section (see
 * `t3team-AgentsPanelForkSection.tsx`): building the child-thread tree and
 * ordering it by status priority. Kept out of the presentation component so
 * the panel stays small; the panel's "N idle · expand" collapsing and the
 * nested indentation live in `t3team-AgentsPanelSubRunTree.tsx`.
 */
import type { ProjectThread } from "~/t3team/t3team-types";

export type SubRunOpenCallback = (input: {
  readonly projectId: string;
  readonly threadId: string;
}) => void;

/** Working first, then errors, then recent (settled); idle last (collapsed by the panel). */
export const STATUS_PRIORITY: Record<ProjectThread["status"], number> = {
  running: 0,
  error: 1,
  completed: 2,
  idle: 3,
};

export interface SubRunNode {
  readonly thread: ProjectThread;
  readonly children: ReadonlyArray<SubRunNode>;
}

/**
 * Recursively build the sub-run tree under `rootThreadId` from the parentId->children map.
 * Cycle-guarded: a thread that reappears on its own ancestor path (or maps back to the root)
 * contributes no children, so a malformed relation can never hang the render.
 */
export function buildSubRunTree(
  rootThreadId: string,
  childThreadsByParentId: ReadonlyMap<string, ReadonlyArray<ProjectThread>>,
): SubRunNode[] {
  const build = (parentId: string, ancestors: ReadonlySet<string>): SubRunNode[] =>
    (childThreadsByParentId.get(parentId) ?? []).map((thread) => ({
      thread,
      children:
        ancestors.has(thread.id) || thread.id === rootThreadId
          ? []
          : build(thread.id, new Set(ancestors).add(thread.id)),
    }));
  return build(rootThreadId, new Set([rootThreadId]));
}

/** Status-priority order; within a status, most recently active first. */
export function sortSubRunNodes(nodes: ReadonlyArray<SubRunNode>): SubRunNode[] {
  return [...nodes].sort(
    (a, b) =>
      STATUS_PRIORITY[a.thread.status] - STATUS_PRIORITY[b.thread.status] ||
      Date.parse(b.thread.lastMessageAt) - Date.parse(a.thread.lastMessageAt),
  );
}
