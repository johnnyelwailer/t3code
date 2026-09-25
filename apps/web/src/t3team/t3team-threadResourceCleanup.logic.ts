/**
 * Pure pieces of the memory-pressure thread surfaces (flag
 * `NEXI_FF_RESOURCE_PRESSURE`): the paused state folded from the thread's
 * `resource-pressure.*` activity trail (survives reloads, shows on every
 * client), and the cleanup confirm/result texts. The confirm text lists every
 * PID that will get SIGINT and why, and what is skipped — the dialog is the
 * user's only view of exactly what the one click does.
 */
import type {
  ResourcePressureCleanupPlan,
  ResourcePressureCleanupResult,
} from "@t3tools/contracts";

export const KIND_PRESSURE_PAUSED = "resource-pressure.paused";
export const KIND_PRESSURE_RESUMED = "resource-pressure.resumed";

export interface ResourcePressurePauseState {
  readonly since: string;
}

/** Latest paused/resumed activity wins; null = not paused. */
export function deriveResourcePressurePause(
  activities: ReadonlyArray<{ readonly kind: string; readonly createdAt: string }>,
): ResourcePressurePauseState | null {
  let state: ResourcePressurePauseState | null = null;
  for (const activity of activities) {
    if (activity.kind === KIND_PRESSURE_PAUSED) state = { since: activity.createdAt };
    else if (activity.kind === KIND_PRESSURE_RESUMED) state = null;
  }
  return state;
}

const mb = (bytes: number): string => `${Math.round(bytes / 1024 ** 2)} MB`;

/** Null when the plan has nothing to stop (the caller says so instead of asking). */
export function cleanupConfirmMessage(plan: ResourcePressureCleanupPlan): string | null {
  if (plan.targets.length === 0 && plan.agentSession === null) return null;
  const lines = ["Clean up this thread's resources?"];
  if (plan.targets.length > 0) {
    lines.push("", "SIGINT (like Ctrl-C) to:");
    for (const target of plan.targets) {
      lines.push(
        `• PID ${target.pid} — ${target.reason}: ${target.command} (${mb(target.residentBytes)})`,
      );
    }
  }
  if (plan.agentSession !== null) {
    lines.push("", "Stop:", `• ${plan.agentSession.reason}`);
  }
  if (plan.skipped.length > 0) {
    lines.push("", "Not signaled:");
    for (const skipped of plan.skipped) lines.push(`• ${skipped.label} — ${skipped.reason}`);
  }
  lines.push("", "Worktrees and files are not touched.");
  return lines.join("\n");
}

export function cleanupResultTitle(result: ResourcePressureCleanupResult): string {
  return result.notSignaled.length === 0 ? "Thread resources cleaned up" : "Cleanup partly done";
}

export function cleanupResultDescription(result: ResourcePressureCleanupResult): string {
  const skipped = result.notSignaled.map((entry) => `PID ${entry.pid}: ${entry.reason}`);
  return [result.message, ...skipped].join("\n");
}
