import type { CloudSession } from "@t3tools/contracts";

/**
 * Phase durations of one plain session measured on fleet run 248523362: a rough figure, not a
 * forecast for any particular session. Shared by every provisioning surface.
 */
const PHASE_SECONDS = { requested: 4, queued: 10, preparing: 121, starting: 10 };

/** Dispatch to ready for that one measured plain session. */
export const CLOUD_SESSION_ROUGH_READY_SECONDS = Object.values(PHASE_SECONDS).reduce(
  (total, seconds) => total + seconds,
  0,
);

/**
 * Fraction of the rough figure that has elapsed, clamped to [0, 1]. Saturates at 1 for a
 * slow-but-healthy session rather than implying it has stalled.
 */
export function cloudSessionProvisionProgress(session: CloudSession): number {
  return Math.min(1, Math.max(0, session.elapsedSeconds / CLOUD_SESSION_ROUGH_READY_SECONDS));
}
