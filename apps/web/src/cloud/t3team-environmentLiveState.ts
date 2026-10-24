import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";

/**
 * Whether what the app shows for an environment's threads (a turn "Working for 15s", a sidebar
 * "Working 16s") is still live.
 *
 * A thread's running state arrives over the environment's own connection. When that connection is
 * down the last pushed state stays in the store, and its elapsed counters keep counting from a
 * stored start time: the app would say "Working 16s" about a machine it has not heard from in
 * minutes. This is the one rule for when to stop saying so, shared by the sidebar row, the thread's
 * working row and the stories.
 *
 * - `live`: connected (or never expected to be): show state as it is.
 * - `offline`: the connection is down; the last known state is stale. Show it frozen, say so, and
 *   stop the counters. Resumes by itself when the connection returns.
 * - `ended`: the connection failed because the cloud session no longer exists. Nothing is coming
 *   back; the state is final.
 */
export type EnvironmentLiveState = "live" | "offline" | "ended";

export function resolveEnvironmentLiveState(input: {
  readonly phase: EnvironmentConnectionPhase;
  /** The supervisor parked the connection on `session_ended` (`isSessionEndedFailure`). */
  readonly sessionEnded: boolean;
  /** The reconnect grace (`environmentReconnectGraceMs`) has run out for this outage. */
  readonly graceElapsed: boolean;
}): EnvironmentLiveState {
  const { phase } = input;
  if (phase === "connected" || phase === "available" || phase === "unsupported") return "live";
  if (phase === "error" && input.sessionEnded) return "ended";
  if (phase === "connecting" || phase === "reconnecting") {
    return input.graceElapsed ? "offline" : "live";
  }
  return "offline";
}

/** Whether a phase starts the reconnect grace clock. */
export function isReconnectingPhase(phase: EnvironmentConnectionPhase): boolean {
  return phase === "connecting" || phase === "reconnecting";
}

/**
 * The words for a stale or ended state, for the sidebar row (a few characters) and for the thread
 * (a full sentence). Frozen: no counters.
 */
export const ENVIRONMENT_LIVE_STATE_COPY = {
  offline: {
    sidebar: "Offline",
    thread: "Offline — last seen working",
  },
  ended: {
    sidebar: "Ended",
    thread: "Cloud session ended",
  },
} as const;

export interface LiveStateSidebarOverride {
  readonly label: string;
  readonly className: string;
}

/**
 * What replaces a *working* sidebar row's word and colour while its environment is not live, or
 * null to keep the row's own. The row's duration counter stops with it (`frozen`). Only "working"
 * is corrected: it is the one status that claims something is running and ticks a counter; idle,
 * done and failed rows are history.
 */
export function resolveLiveStateSidebarOverride(
  liveState: EnvironmentLiveState,
): LiveStateSidebarOverride | null {
  if (liveState === "live") return null;
  return {
    label: ENVIRONMENT_LIVE_STATE_COPY[liveState].sidebar,
    className: liveState === "ended" ? "text-muted-foreground" : "text-warning",
  };
}
