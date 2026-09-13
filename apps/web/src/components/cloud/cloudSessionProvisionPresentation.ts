/**
 * Presentation logic for provisioning a *cloud session*: a full Nexi workspace
 * started on fleet compute, which joins the user's T3 Connect environment list
 * once its relay link is up.
 *
 * Pure and React-free on purpose — the panel and its story both import from
 * here, so the phase vocabulary and the wording can never drift between them.
 *
 * The phase list mirrors what the provisioning job observably does, not what a
 * provider's API happens to call it. Measured on the first green run
 * (hive/nx-nexi run 248523362, 2026-09-12): accepted→queued 4s,
 * checkout+install+build 121s, `t3 serve` ready 10s, relay link provisioned 9s.
 */

/**
 * Where a cloud session's compute comes from. Vendor-specific by nature — the
 * provisioning mechanics genuinely differ per provider — so these read as
 * provider ids, in the same shape as `RelayManagedEndpointProviderKind`.
 */
export const CLOUD_SESSION_PROVIDER_KINDS = ["github_actions", "azure_container_apps"] as const;
export type CloudSessionProviderKind = (typeof CLOUD_SESSION_PROVIDER_KINDS)[number];

/**
 * Lifecycle of one provisioning attempt.
 *
 * `ready` is the only phase that carries an `environmentId`, because it is the
 * only phase in which the relay has published an environment link — before
 * that there is nothing for the client to connect to.
 */
export const CLOUD_SESSION_PROVISION_PHASES = [
  "requested",
  "queued",
  "preparing",
  "starting",
  "ready",
  "failed",
  "stopped",
] as const;
export type CloudSessionProvisionPhase = (typeof CLOUD_SESSION_PROVISION_PHASES)[number];

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
}

/**
 * A session as the panel needs to render it. Deliberately not the provider's
 * response shape: the panel must not learn what a "workflow run" is.
 */
export interface CloudSession {
  readonly sessionId: string;
  readonly providerKind: CloudSessionProviderKind;
  readonly phase: CloudSessionProvisionPhase;
  /** Set only once the relay has published the link (phase `ready`). */
  readonly environmentId: string | null;
  /** Seconds since this attempt was dispatched. */
  readonly elapsedSeconds: number;
  /** Remaining session lifetime in seconds; null when not yet running. */
  readonly remainingSeconds: number | null;
  /** Human-readable compute shape, e.g. "ubuntu-slim · 12 GB · 4 cores". */
  readonly machineLabel: string;
  /** Provider-supplied reason, shown verbatim when the phase is `failed`. */
  readonly failureReason: string | null;
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
      };
    case "queued":
      return {
        title: "Waiting for a machine",
        detail: `${session.machineLabel} · queued ${elapsed}`,
        tone: "working",
        progress: cloudSessionProgress(session.elapsedSeconds),
        actionLabel: "Cancel",
      };
    case "preparing":
      return {
        title: "Building the workspace",
        detail: `Installing dependencies and building · ${elapsed}`,
        tone: "working",
        progress: cloudSessionProgress(session.elapsedSeconds),
        actionLabel: "Cancel",
      };
    case "starting":
      return {
        title: "Opening the relay",
        detail: `Server is up, publishing its environment link · ${elapsed}`,
        tone: "working",
        progress: cloudSessionProgress(session.elapsedSeconds),
        actionLabel: "Cancel",
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
      };
    case "failed":
      return {
        title: "Provisioning failed",
        detail: session.failureReason ?? "The session stopped before it became reachable.",
        tone: "error",
        progress: null,
        actionLabel: "Retry",
      };
    case "stopped":
      return {
        title: "Stopped",
        detail: `Ran for ${elapsed}.`,
        tone: "idle",
        progress: null,
        actionLabel: "Start another",
      };
  }
}

/** Canonical tone → dot colour, matching `connectionPhaseDotClassName`. */
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
