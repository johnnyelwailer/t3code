// @effect-diagnostics globalConsole:off -- fire-and-forget delivery failure log in a plain Promise path, outside any Effect runtime.
/**
 * Pushes a workflow run's status to its launch thread's sidebar row.
 *
 * A durable run's `status`/`pendingKind`/`wakeAt` live in `workflow_runs`, not on the V2 thread
 * shell, so they travel on the fork thread-facts side stream (`workflowRunStatus`,
 * `sleepingUntil`). On every run transition the host re-derives both from `workflow_runs` and
 * patches the launch thread's facts (`T3TeamWorkflowHost.syncRunFacts`); subscribers of
 * `t3team.subscribeThreadFacts` see the change live.
 */
import type { WorkflowHostPort } from "./t3team-workflowHostPort.ts";

export interface PushWorkflowRunThreadShellInput {
  /** The run's `launchThreadId`; a headless run (no launch thread) is a no-op. */
  readonly launchThreadId: string | null | undefined;
  /** Absent for callers that run without a host (the fs/in-memory path) — a no-op then. */
  readonly host: Pick<WorkflowHostPort, "syncRunFacts"> | undefined;
}

/** Refresh the launch thread's run facts. One-way and swallows failures — a lost push must not
 * fail a run; the client still catches up on its next facts snapshot (e.g. a reconnect). */
export function pushWorkflowRunThreadShell(input: PushWorkflowRunThreadShellInput): void {
  if (input.launchThreadId === null || input.launchThreadId === undefined) return;
  if (input.host === undefined) return;
  const threadId = input.launchThreadId;
  void input.host.syncRunFacts(threadId).catch((error: unknown) => {
    console.warn(`[t3team-workflow] run facts push failed for launch thread ${threadId}:`, error);
  });
}

/** Collapses repeated `beforePrimitive`-style re-affirmations of the SAME status (the admission
 * queue re-validates `queued`→`running` before every durable step, not just on a real
 * transition) down to one push per actual status change. Holds one closure of `lastStatus` per
 * run — construct once per run lifecycle, call on every candidate transition. */
export function createWorkflowRunShellPusher(
  input: PushWorkflowRunThreadShellInput,
): (status: string) => void {
  let lastStatus: string | undefined;
  return (status: string): void => {
    if (lastStatus === status) return;
    lastStatus = status;
    pushWorkflowRunThreadShell(input);
  };
}
