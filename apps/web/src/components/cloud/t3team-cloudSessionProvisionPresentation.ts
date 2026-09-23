import type { CloudSession, CloudSessionPhase } from "@t3tools/contracts";

/**
 * Presentation logic for provisioning a *cloud session*: a full Nexi workspace
 * started on fleet compute that joins the user's T3 Connect environment list
 * once its relay link is up. Pure and React-free on purpose — the panel and its
 * story both import from here, so the phase vocabulary and wording cannot
 * drift between them. Phases mirror what the job observably does, not what a
 * provider's API happens to call it.
 */

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
export const CLOUD_SESSION_PHASE_TYPICAL_SECONDS: Readonly<
  Record<CloudSessionProvisionPhase, number>
> = {
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
export const CLOUD_SESSION_TYPICAL_TOTAL_SECONDS = CLOUD_SESSION_PROVISION_PHASES.filter(
  isCloudSessionProvisionPending,
).reduce((total, phase) => total + CLOUD_SESSION_PHASE_TYPICAL_SECONDS[phase], 0);

export interface CloudSessionProvisionPresentation {
  readonly title: string;
  /** One line under the title. Never the raw phase id. */
  readonly detail: string;
  readonly tone: "ready" | "working" | "error" | "idle";
  /** 0–1, or null when the phase has no meaningful progress. */
  readonly progress: number | null;
  /** Label for the row's primary action, or null when it has none. */
  readonly actionLabel: string | null;
  /** Label for a secondary action on the row, or null when it has none. Kept
   *  apart from the primary so a ready machine's release is never buried behind
   *  its connect. */
  readonly secondaryActionLabel: string | null;
  /** True when `detail` ends with a live "· <elapsed>" suffix the row ticks on
   *  a one-second timer rather than the frozen server snapshot. */
  readonly liveElapsed: boolean;
}

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

export function presentCloudSession(session: CloudSession): CloudSessionProvisionPresentation {
  const elapsed = formatDuration(session.elapsedSeconds);

  switch (session.phase) {
    case "requested":
      return {
        title: "Requesting a machine",
        detail: "Handing the session to the fleet.",
        tone: "working",
        progress: cloudSessionProgress(session.elapsedSeconds),
        actionLabel: "Cancel",
        secondaryActionLabel: null,
        liveElapsed: false,
      };
    case "queued":
      return {
        title: "Waiting for a machine",
        detail: `${session.machineLabel} · queued ${elapsed}`,
        tone: "working",
        progress: cloudSessionProgress(session.elapsedSeconds),
        actionLabel: "Cancel",
        secondaryActionLabel: null,
        liveElapsed: true,
      };
    case "preparing":
      return {
        title: "Building the workspace",
        detail: `Installing dependencies and building · ${elapsed}`,
        tone: "working",
        progress: cloudSessionProgress(session.elapsedSeconds),
        actionLabel: "Cancel",
        secondaryActionLabel: null,
        liveElapsed: true,
      };
    case "starting":
      return {
        title: "Almost there",
        detail: `Making it reachable · ${elapsed}`,
        tone: "working",
        progress: cloudSessionProgress(session.elapsedSeconds),
        actionLabel: "Cancel",
        secondaryActionLabel: null,
        liveElapsed: true,
      };
    case "ready":
      return {
        title: "Ready",
        detail:
          session.remainingSeconds === null
            ? session.machineLabel
            : `${session.machineLabel} · ${formatDuration(session.remainingSeconds)} left`,
        tone: "ready",
        progress: null,
        actionLabel: "Connect",
        secondaryActionLabel: "Stop",
        liveElapsed: false,
      };
    case "failed":
      return {
        title: "Provisioning failed",
        detail: session.failureReason ?? "The session stopped before it became reachable.",
        tone: "error",
        progress: null,
        actionLabel: "Retry",
        secondaryActionLabel: null,
        liveElapsed: false,
      };
    case "stopped":
      return {
        title: "Stopped",
        detail: `Ran for ${
          session.durationSeconds === undefined ? elapsed : formatDuration(session.durationSeconds)
        }.`,
        tone: "idle",
        progress: null,
        actionLabel: "Start another",
        secondaryActionLabel: null,
        liveElapsed: false,
      };
    case "cancelled":
      return {
        title: "Cancelled",
        detail: "Stopped by you.",
        tone: "idle",
        progress: null,
        actionLabel: "Start another",
        secondaryActionLabel: null,
        liveElapsed: false,
      };
  }
}

export function cloudSessionToneDotClassName(
  tone: CloudSessionProvisionPresentation["tone"],
): string {
  switch (tone) {
    case "ready":
      return "bg-success";
    case "working":
      return "bg-warning";
    case "error":
      return "bg-destructive";
    case "idle":
      return "bg-muted-foreground/40";
  }
}

/** Ping halo while work is in flight; null renders no ping. */
export function cloudSessionTonePingClassName(
  tone: CloudSessionProvisionPresentation["tone"],
): string | null {
  return tone === "working" ? "bg-warning/60 duration-2000" : null;
}
