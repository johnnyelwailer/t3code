/**
 * One structured client log line per outcome of the "Project ready" wait: how it ended, on which
 * environment, why, and after how long. The line is the evidence a field report needs ("it sat
 * for hours" becomes a reason and a duration); nothing logged this step before. The client has no
 * log service, so the line goes through `console.info` with the `[t3-cloud]` prefix the cloud
 * code already uses. The sink is injectable; each (message, outcome) is written once, however
 * often the flusher re-evaluates.
 */
import { cloudProjectWaitSeconds } from "./t3team-cloudProjectWaitClock";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import type { MachineProjectBinding } from "./t3team-cloudSessionMachineProject";

export type CloudProjectWaitOutcome =
  | "resolved-bootstrap-id"
  | "resolved-folder"
  | "failed"
  | "ended"
  | "cancelled";

export interface CloudProjectWaitOutcomeLine {
  readonly outcome: CloudProjectWaitOutcome;
  readonly environmentId: string | null;
  /** The classifier's reason (`CloudProjectWaitReason`); null when resolved or not classified. */
  readonly reason: string | null;
  readonly elapsedSeconds: number;
  readonly messageId: string;
}

export type CloudProjectWaitLogSink = (line: CloudProjectWaitOutcomeLine) => void;

const consoleSink: CloudProjectWaitLogSink = (line) =>
  console.info("[t3-cloud] project-wait outcome", line);

export const resolvedOutcomeOf = (by: MachineProjectBinding | null): CloudProjectWaitOutcome =>
  by === "bootstrap-id" ? "resolved-bootstrap-id" : "resolved-folder";

const written = new Set<string>();
const WRITTEN_LIMIT = 200;

/**
 * Writes the outcome of a wait that took place (the send had reached the "Project ready" step,
 * which is what stamps it); a send that never waited writes nothing. False when nothing was
 * written (no wait, or already written).
 */
export function logCloudProjectWaitOutcome(
  input: {
    readonly queued: CloudQueuedSend;
    readonly outcome: CloudProjectWaitOutcome;
    readonly environmentId: string | null;
    readonly reason: string | null;
    readonly nowMs: number;
  },
  sink: CloudProjectWaitLogSink = consoleSink,
): boolean {
  const { queued, outcome } = input;
  if (queued.stepStartedAt?.project === undefined) return false;
  // The stamp tells attempts apart: a retry restamps the step and may end differently.
  const key = `${queued.messageId}:${outcome}:${queued.stepStartedAt.project}`;
  if (written.has(key)) return false;
  if (written.size >= WRITTEN_LIMIT) written.clear();
  written.add(key);
  sink({
    outcome,
    environmentId: input.environmentId,
    reason: input.reason,
    elapsedSeconds: cloudProjectWaitSeconds(queued, input.nowMs),
    messageId: queued.messageId,
  });
  return true;
}

/** Forgets what was written (tests). */
export function resetCloudProjectWaitLog(): void {
  written.clear();
}
