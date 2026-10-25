/**
 * The bound on the "Project ready" step of a queued cloud send. Without one a draft whose project
 * never reaches the machine waits forever (11 h 52 m in the field); with it the send moves to a
 * typed `project_not_resolved` failure that keeps the message. Pure.
 *
 * - The clock is the step's own wall-clock stamp (`stepStartedAt.project`), never the session's
 *   age. The stamp is persisted with the draft, so an app restart does not restart the bound, and
 *   it is only made once the machine is connected, so provisioning time never counts.
 * - A machine that drops and returns does not restart the bound either (the stamp stays); the
 *   decision only runs while connected.
 * - A settle period after this window first sees the machine connected keeps the bound from
 *   firing before the machine's project list had a chance to sync into this window: a relaunch
 *   long after the stamp, or a laptop that slept, still gets `CLOUD_PROJECT_WAIT_SETTLE_SECONDS`.
 */
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";

/**
 * Seconds on the step before the send gives up. A healthy machine lists its project within
 * seconds of connecting; the wording turns "slow" at 90 s. 180 s is twice that, long enough for a
 * slow link and short enough that the user is still at the draft.
 */
export const CLOUD_PROJECT_WAIT_BOUND_SECONDS = 180;
/** Seconds this window must have seen the machine connected before the bound may fire. */
export const CLOUD_PROJECT_WAIT_SETTLE_SECONDS = 30;

/** When the step's bound is reached, or null while there is no stamp or no connected sighting. */
export function cloudProjectWaitDeadlineMs(
  queued: CloudQueuedSend,
  connectedSinceMs: number | null,
): number | null {
  const stamp = queued.stepStartedAt?.project;
  const stampedMs = stamp === undefined ? Number.NaN : Date.parse(stamp);
  if (!Number.isFinite(stampedMs) || connectedSinceMs === null) return null;
  return Math.max(
    stampedMs + CLOUD_PROJECT_WAIT_BOUND_SECONDS * 1000,
    connectedSinceMs + CLOUD_PROJECT_WAIT_SETTLE_SECONDS * 1000,
  );
}

export function isCloudProjectWaitExpired(
  queued: CloudQueuedSend,
  connectedSinceMs: number | null,
  nowMs: number,
): boolean {
  const deadlineMs = cloudProjectWaitDeadlineMs(queued, connectedSinceMs);
  return deadlineMs !== null && nowMs >= deadlineMs;
}

/**
 * Per environment, when this window first saw the machine connected in the current stretch:
 * set on the first connected sighting, cleared when it is no longer connected. In memory on
 * purpose: a restart is a new sighting.
 */
export function trackMachineConnectedSince(
  connectedSince: Map<string, number>,
  environmentId: string,
  connected: boolean,
  nowMs: number,
): number | null {
  if (!connected) {
    connectedSince.delete(environmentId);
    return null;
  }
  const known = connectedSince.get(environmentId);
  // A sighting from the future is a clock that was set back: start over from the present one.
  if (known !== undefined && known <= nowMs) return known;
  connectedSince.set(environmentId, nowMs);
  return nowMs;
}
