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
  // A brief blip (the local server restarting, a socket renewed) is not worth rewriting the row
  // for; the composer banner waits the same grace before it says anything.
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
    sidebarTitle: "Offline — last seen working. Resumes when the connection returns.",
    thread: "Offline — last seen working",
  },
  ended: {
    sidebar: "Ended",
    sidebarTitle: "This cloud session has ended.",
    thread: "Cloud session ended",
  },
} as const;

/** The sidebar statuses whose truth depends on the thread's environment being reachable. */
type ThreadRowStatus = "working" | "waiting" | "approval" | "input" | (string & {}) | null;

export interface LiveStateTopStatus {
  readonly label: string;
  readonly title: string;
  readonly icon: "offline";
  readonly className: string;
}

/**
 * The sidebar status that replaces a row's live one when its environment is not live, or null to
 * keep the row's own. Offline only corrects "working" (the one status with a ticking counter);
 * an ended session also corrects everything that waits on the session: a waiting turn, an approval
 * or a question nobody can answer any more. Idle, done and failed rows are history and stay.
 */
export function resolveLiveStateTopStatus(
  liveState: EnvironmentLiveState,
  status: ThreadRowStatus,
): LiveStateTopStatus | null {
  if (liveState === "live") return null;
  const overridden =
    status === "working" ||
    (liveState === "ended" &&
      (status === "waiting" || status === "approval" || status === "input"));
  if (!overridden) return null;
  const copy = ENVIRONMENT_LIVE_STATE_COPY[liveState];
  return {
    label: copy.sidebar,
    title: copy.sidebarTitle,
    icon: "offline",
    className: liveState === "ended" ? "text-muted-foreground" : "text-warning",
  };
}
