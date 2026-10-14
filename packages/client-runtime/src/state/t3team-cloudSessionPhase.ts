import type { CloudSessionPhase } from "@t3tools/contracts";

/**
 * `ready` is the only phase where the relay has published an environment link —
 * before that there is nothing to connect to. Kept as a local const (rather
 * than the contract's Schema) because the progress maths iterates over it;
 * `satisfies` keeps it honest against the contract, so a phase added
 * server-side cannot be silently dropped from the wording here.
 */
export const CLOUD_SESSION_PROVISION_PHASES = [
  "requested",
  "queued",
  "preparing",
  "starting",
  "ready",
  "failed",
  "stopped",
  "cancelled",
] as const satisfies readonly CloudSessionPhase[];
export type CloudSessionProvisionPhase = CloudSessionPhase;

/** Phases in which the session is still working toward `ready`. */
export function isCloudSessionProvisionPending(phase: CloudSessionProvisionPhase): boolean {
  return (
    phase === "requested" || phase === "queued" || phase === "preparing" || phase === "starting"
  );
}

/**
 * Typical wall-clock for each pending phase, in seconds, measured on run
 * 248523362. Used only to shape a determinate progress hint — a session that
 * overruns its estimate is not a failure, so the bar saturates rather than
 * resetting or flipping to an error.
 */
const CLOUD_SESSION_PHASE_TYPICAL_SECONDS: Readonly<Record<CloudSessionProvisionPhase, number>> = {
  requested: 4,
  queued: 10,
  preparing: 121,
  starting: 10,
  ready: 0,
  failed: 0,
  stopped: 0,
  cancelled: 0,
};

/** Total typical seconds from dispatch to a connectable environment. */
const CLOUD_SESSION_TYPICAL_TOTAL_SECONDS = CLOUD_SESSION_PROVISION_PHASES.filter(
  isCloudSessionProvisionPending,
).reduce((total, phase) => total + CLOUD_SESSION_PHASE_TYPICAL_SECONDS[phase], 0);

/** "2m 34s", "47s", "5h 12m" — the coarsest unit pair that stays honest. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Fraction of the typical total that has elapsed, clamped to [0, 1]. Saturates
 * at 1 for a slow-but-healthy session rather than implying it has stalled.
 */
export function cloudSessionProgress(elapsedSeconds: number): number {
  if (CLOUD_SESSION_TYPICAL_TOTAL_SECONDS <= 0) return 0;
  return Math.min(1, Math.max(0, elapsedSeconds / CLOUD_SESSION_TYPICAL_TOTAL_SECONDS));
}
