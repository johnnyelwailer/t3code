import type { WorkflowJobStep, WorkflowRunSummary } from "./githubActionsSessionClient.ts";

/**
 * Derive a cloud session's phase from its provisioning job.
 *
 * Pure and table-driven, so the rules can be read and tested without a fleet.
 * The step names below are the real ones from the first green run
 * (hive/nx-nexi 248523362, 2026-09-12); matching tolerates any of them being
 * absent, because a workflow edit must degrade to a coarser phase rather than
 * crash the session list.
 */

export type CloudSessionPhase =
  | "requested"
  | "queued"
  | "preparing"
  | "starting"
  | "ready"
  | "failed"
  | "stopped";

/** A step counts as reached once it starts — not only once it finishes. */
function reached(step: WorkflowJobStep | undefined): boolean {
  return step !== undefined && (step.status === "in_progress" || step.conclusion === "success");
}

function findByPrefix(
  steps: readonly WorkflowJobStep[],
  prefix: string,
): WorkflowJobStep | undefined {
  return steps.find((step) => step.name.startsWith(prefix));
}

export function deriveCloudSessionPhase(
  run: WorkflowRunSummary,
  steps: readonly WorkflowJobStep[],
): CloudSessionPhase {
  // A finished run's outcome is decided by the run, not its steps: a job that
  // held the machine for its full duration and exited cleanly is `stopped`,
  // which is a normal end, not a failure.
  if (run.status === "completed") {
    return run.conclusion === "success" ? "stopped" : "failed";
  }
  if (run.status === "queued" || run.status === "pending" || run.status === "waiting") {
    return "queued";
  }

  // In progress. Walk backwards through the milestones, most advanced first.
  if (reached(findByPrefix(steps, "Hold the session"))) return "ready";

  // `Capture connect status` only succeeds once the relay reported
  // `Environment link: provisioned`, so its success is the real readiness
  // signal — the job going green is not.
  const captured = steps.find((step) => step.name === "Capture connect status");
  if (captured?.conclusion === "success") return "ready";

  if (reached(findByPrefix(steps, "Start t3 serve"))) return "starting";
  if (
    reached(findByPrefix(steps, "Install dependencies")) ||
    reached(findByPrefix(steps, "Checkout"))
  ) {
    return "preparing";
  }
  if (steps.length === 0) return "requested";
  return "preparing";
}

/** Seconds a session has been alive. Never negative — a clock skew must not
    render as a session that started in the future. */
export function cloudSessionElapsedSeconds(run: WorkflowRunSummary, nowMs: number): number {
  const startedMs = Date.parse(run.createdAt);
  if (Number.isNaN(startedMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startedMs) / 1000));
}
