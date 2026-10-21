/**
 * The successor side of a thread handoff: its workspace, its first message, and whether its
 * first run is live.
 * Pure; see `t3team-threadHandoff.ts` for the pipeline that uses them.
 */
import type { OrchestrationV2ThreadShell, T3TeamThreadHandoffCapture } from "@t3tools/contracts";

import type { ThreadHandoffEndpoint } from "./t3team-threadHandoff.ts";

/** The successor's workspace: its own worktree and branch, started from the pushed branch. */
export type ThreadHandoffWorkspace =
  | { readonly type: "root" }
  | { readonly type: "worktree"; readonly baseBranch: string; readonly startFromOrigin: true };

export function successorWorkspace(
  capture: Pick<T3TeamThreadHandoffCapture, "branch">,
): ThreadHandoffWorkspace {
  return capture.branch === null
    ? { type: "root" }
    : { type: "worktree", baseBranch: capture.branch, startFromOrigin: true };
}

/**
 * The successor's first message, in the same shape a provider handoff delivers context
 * (`Context handoff (<strategy>):` … `User message:`), so the agent reads it the same way.
 */
export function continuationEnvelope(input: {
  readonly capture: T3TeamThreadHandoffCapture;
  readonly source: ThreadHandoffEndpoint;
  readonly interrupted: boolean;
}): string {
  const { capture, source } = input;
  const instructions = [
    `This thread continues "${capture.title}", moved here from ${source.label} (environment ${source.environmentId}, thread ${source.threadId}). The transcript above is that thread's history; its tool references point at the other machine.`,
    capture.branch === null
      ? null
      : `This checkout is a fresh worktree started from origin/${capture.branch}. Push your work back to that branch (git push origin HEAD:${capture.branch}) so the original thread can pick it up.`,
    `Anything not pushed before the move stayed on ${source.label}. Check the repository state first, then pick up where the previous turn left off${input.interrupted ? " (it was stopped mid-way)" : ""}.`,
  ].filter((line) => line !== null);
  return [
    "Context handoff (full_thread_summary):",
    capture.summaryText,
    "",
    "User message:",
    instructions.join("\n\n"),
  ].join("\n");
}

/**
 * Where the successor's first run is, read from its thread shell: `live` once the provider
 * turn is underway (or already done), `failed` when it ended without running, `pending` before.
 * `preparing` (worktree fetch/checkout/setup still ahead, any of which can fail the run) and
 * `starting` (provider turn not yet accepted) stay pending: the source is settled on `live`.
 */
export function successorRunState(
  shell: Pick<OrchestrationV2ThreadShell, "status" | "latestRunId"> | undefined,
): "pending" | "live" | "failed" {
  if (shell === undefined || shell.latestRunId === null) return "pending";
  switch (shell.status) {
    case "running":
    case "waiting":
    case "completed":
      return "live";
    case "failed":
    case "cancelled":
    case "interrupted":
    case "rolled_back":
      return "failed";
    default:
      return "pending";
  }
}
