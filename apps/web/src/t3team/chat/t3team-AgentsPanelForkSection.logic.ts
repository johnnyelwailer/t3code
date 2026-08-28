/**
 * Pure logic for the t3team Agents panel sub-runs section (see
 * `t3team-AgentsPanelForkSection.tsx`): building the child-thread tree and
 * ordering it by status priority. Kept out of the presentation component so
 * the panel stays small; the panel's "N idle · expand" collapsing and the
 * nested indentation live in `t3team-AgentsPanelSubRunTree.tsx`.
 */
import type { ProjectThread } from "~/t3team/t3team-types";
import { compareSubRunThreads } from "~/t3team/components/t3team-projectSidebarThreadTree";

export type SubRunOpenCallback = (input: {
  readonly projectId: string;
  readonly threadId: string;
}) => void;

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

/**
 * Stable sub-run ordering, identical to the sidebar's sub-run list
 * (`compareSubRunThreads` in `t3team-projectSidebarThreadTree.ts`): lifecycle groups first
 * (running, waiting/error, idle, settled), then createdAt newest-first with an id tiebreak.
 * Activity NEVER reorders the list — a row holds its position from open until settled, so the
 * panel only reorders at lifecycle transitions, never on a message. The panel caps how many
 * rows render at once (see `t3team-AgentsPanelSubRunTree.tsx`), so the top of this order is
 * the active set the user wants to see.
 */
export function sortSubRunNodes(nodes: ReadonlyArray<SubRunNode>): SubRunNode[] {
  return nodes.toSorted((a, b) => compareSubRunThreads(a.thread, b.thread));
}
