/**
 * Pure logic for the t3team sub-run tree: building the child-thread tree and
 * ordering it by status priority. Kept out of the presentation component so
 * it stays small; the "N idle · expand" collapsing and the nested indentation
 * live in `t3team-AgentsPanelSubRunTree.tsx`.
 */
import type { ProjectThread } from "~/t3team/t3team-types";
import { compareSubRunThreads } from "~/t3team/components/t3team-projectSidebarThreadTree";
import { resolveActivityPillDisplay } from "~/t3team/t3team-activityStateDisplay";

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

/**
 * The stable status labels of the panel sub-run rows (pre-live-state, kept as the
 * resolver's fallback tier).
 */
export const SUB_RUN_STATUS_LABEL: Record<ProjectThread["status"], string> = {
  idle: "Idle",
  running: "Running",
  completed: "Completed",
  error: "Failed",
};

/**
 * The parent's "own work settled, child work still live" label. Matches the word upstream's
 * sidebar uses for pending background work (V2 `pendingBackgroundTasks`), so the sub-run tree
 * and the sidebar never name the same fact differently. Uses the working colour, not amber:
 * amber stays reserved for "Question awaiting answer", which actually needs the user.
 */
export const SUB_RUN_WAITING_LABEL = "Waiting";

/**
 * The live status TEXT of a panel sub-run/agent row — the SAME shared resolution the
 * sidebar sub-run rows use (`resolveActivityPillDisplay` over the same `activityLabel`
 * field, so the panel and the sidebar never disagree at this seam): the LLM activity
 * label REPLACES the stable status word while it flows (only while the
 * `t3teamActivityLabelsEnabled` flag is on — the caller gates the flag here, mirroring
 * t3team-SidebarSubRunRow); the server's `childStatus` summary backs it up when no
 * label flows. Listed rows have no thinking/writing word: that needs the
 * thread's turn items, which only the open thread loads.
 */
const LIVE_SHELL_WORDS = new Set(["preparing", "starting", "queued", "running"]);

export function resolveSubRunStatusLabel(
  thread: Pick<
    ProjectThread,
    | "status"
    | "shellRunStatus"
    | "activityLabel"
    | "childStatus"
    | "pendingUserInput"
    | "waitingOnChildren"
    | "awaitingParent"
  >,
  options: { readonly activityLabelsEnabled: boolean },
): string {
  // A question docked in this thread's composer outranks the run state: the
  // parent's next action is to look at that question (the row click jumps to
  // the child's thread, where the panel sits).
  if (thread.pendingUserInput === true) {
    return "Question awaiting answer";
  }
  // A plan-mode child that presented its plan and stopped: the turn IS
  // completed, but the parent owes this child a decision (same surface,
  // same navigation as the pending question above — the amber pending
  // treatment, never a separate indicator system).
  if (thread.awaitingParent === true) {
    return "Plan awaiting approval";
  }
  const shell = thread.shellRunStatus;
  // Shell words outrank the collapsed ProjectThread.status. A finished run
  // that is not archived (and so not `status: "completed"`) still says
  // Completed, not Idle.
  if (shell === "preparing" || shell === "starting") return "Starting";
  if (shell === "queued") return "Queued";
  if (shell === "waiting") return SUB_RUN_WAITING_LABEL;
  const ownLive =
    thread.status === "running" || (shell !== undefined && LIVE_SHELL_WORDS.has(shell));
  const ownFailed = shell === "failed" || thread.status === "error";
  // Own work settled but child work is still live. Own live work and a
  // failed row keep their own word, mirroring the server primitive's precedence.
  if (thread.waitingOnChildren === true && !ownLive && !ownFailed) {
    return SUB_RUN_WAITING_LABEL;
  }
  if (ownLive) {
    return resolveActivityPillDisplay({
      label: "Running",
      // The live activity label wins; between labels (debounced, TTL-limited) the
      // server's child-status summary of the child's recent work fills the gap
      // instead of a bare "Running".
      activityLabel: options.activityLabelsEnabled
        ? (thread.activityLabel ?? thread.childStatus ?? null)
        : null,
    });
  }
  if (ownFailed) return "Failed";
  if (shell === "interrupted" || shell === "cancelled") return "Stopped";
  if (shell === "completed" || thread.status === "completed") return "Completed";
  return SUB_RUN_STATUS_LABEL[thread.status];
}
