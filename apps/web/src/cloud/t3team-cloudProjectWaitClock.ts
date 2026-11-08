/**
 * The clock of the "Project ready" wait: seconds since the step's own stamp, and when its wording
 * next changes. Pure; the banner and the setup card both read the wait through
 * `presentCloudProjectWaitAt`, so they cannot disagree on the level.
 */
import type { CloudProjectWait } from "./t3team-cloudProjectWait";
import {
  CLOUD_PROJECT_WAIT_EXPECTED_SECONDS,
  CLOUD_PROJECT_WAIT_SLOW_SECONDS,
  type CloudProjectWaitNotice,
  presentCloudProjectWait,
} from "./t3team-cloudProjectWaitPresentation";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";

function projectStepStartedMs(queued: CloudQueuedSend | undefined): number {
  const started = queued?.stepStartedAt?.project;
  return started === undefined ? Number.NaN : Date.parse(started);
}

/**
 * Seconds spent on the "project" step at `nowMs`, counted from the step's own stamp: the same
 * figure the step list shows, whatever the session's age. Zero until the step has been stamped.
 */
export function cloudProjectWaitSeconds(
  queued: CloudQueuedSend | undefined,
  nowMs: number,
): number {
  const startedMs = projectStepStartedMs(queued);
  return Number.isFinite(startedMs) ? Math.max(0, Math.floor((nowMs - startedMs) / 1000)) : 0;
}

/** The wording for `wait` at `nowMs`, read by both the composer banner and the setup card. */
export function presentCloudProjectWaitAt(
  wait: CloudProjectWait | null,
  queued: CloudQueuedSend | undefined,
  nowMs: number,
): CloudProjectWaitNotice | null {
  return wait === null
    ? null
    : presentCloudProjectWait(wait, cloudProjectWaitSeconds(queued, nowMs));
}

/** When the wait's wording next changes (the expected or the slow point), or null when it no longer will. */
export function nextCloudProjectWaitChangeMs(
  queued: CloudQueuedSend | undefined,
  nowMs: number,
): number | null {
  const startedMs = projectStepStartedMs(queued);
  if (!Number.isFinite(startedMs)) return null;
  return (
    [CLOUD_PROJECT_WAIT_EXPECTED_SECONDS, CLOUD_PROJECT_WAIT_SLOW_SECONDS]
      .map((seconds) => startedMs + seconds * 1000)
      .find((atMs) => atMs > nowMs) ?? null
  );
}
