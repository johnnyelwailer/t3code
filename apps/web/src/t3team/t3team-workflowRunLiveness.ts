/**
 * Thread liveness contributed by a durable workflow run launched from the thread.
 *
 * A workflow run executes on its own child threads, never on the launch thread's provider
 * session, so a launch thread whose own runtime is idle may still have live work. The run's state
 * arrives as the fork thread facts `workflowRunStatus` (the most recently updated run) and
 * `sleepingUntil` (the soonest wake of any clock-parked run), and folds into the status pill's
 * existing vocabulary instead of a new visual state:
 *
 * - `input`: the run is parked on an `askUser` reply — the user acts next ("Awaiting Input").
 * - `working`: the engine is moving the run (queued, running, a child turn in flight).
 * - `waiting`: nothing executes, but a continuation is scheduled (`sleeping`, `watching`, a
 *   signal wait, or another run's `sleepingUntil`) — read as upstream's "Waiting", never as idle,
 *   so nobody nudges a run that resumes on its own.
 *
 * `workflowRunStatus` keeps the run's LAST status forever, so terminal and paused (deliberately
 * halted) runs are inert.
 */
import type { T3TeamThreadFacts } from "@t3tools/contracts";

import type { SidebarThreadStatus } from "~/components/Sidebar.logic";

export type T3TeamWorkflowRunLiveness = "input" | "working" | "waiting";

const INERT_STATUSES: ReadonlySet<string> = new Set(["paused", "completed", "failed", "cancelled"]);

export function resolveT3TeamWorkflowRunLiveness(
  facts: Pick<T3TeamThreadFacts, "workflowRunStatus" | "sleepingUntil"> | undefined,
): T3TeamWorkflowRunLiveness | null {
  const run = facts?.workflowRunStatus;
  if (run && !INERT_STATUSES.has(run.status)) {
    if (run.status === "sleeping" || run.status === "watching") return "waiting";
    if (run.status === "suspended" && run.pendingKind === "user.input") return "input";
    if (run.status === "suspended" && run.pendingKind === "signal.wait") return "waiting";
    return "working";
  }
  // A thread can launch several runs: the latest may be terminal while another still sleeps.
  return facts?.sleepingUntil ? "waiting" : null;
}

/**
 * Folds a workflow run's liveness into a sidebar row status: attention states (approval, input)
 * and the thread's own work win; a live run outranks an idle, failed or finished launch thread.
 */
export function withT3TeamWorkflowRunStatus(
  status: SidebarThreadStatus,
  liveness: T3TeamWorkflowRunLiveness | null,
): SidebarThreadStatus {
  if (liveness === null || status === "approval" || status === "input" || status === "working") {
    return status;
  }
  if (liveness === "input" || liveness === "working") return liveness;
  return status === "ready" ? "waiting" : status;
}
