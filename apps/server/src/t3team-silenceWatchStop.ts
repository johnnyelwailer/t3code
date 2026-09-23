import type { ThreadBackgroundLiveness } from "./orchestration/ThreadBackgroundLiveness.ts";

const TERMINAL_SESSION_STATUSES: ReadonlySet<string> = new Set(["error", "interrupted", "stopped"]);

/** Decide whether a session state means an armed silence watch is finished. */
export function shouldStopSilenceWatch(
  status: string | undefined,
  liveness: ThreadBackgroundLiveness,
): boolean {
  if (status !== undefined && TERMINAL_SESSION_STATUSES.has(status)) return true;
  return (status === "ready" || status === "idle") && liveness === null;
}

/**
 * Whether a status is a TRUE terminal fact about the target: the hard
 * terminals plus the synthetic "deleted" marker used when the shell is gone
 * and the decider-level "settled" marker (settlement emits no terminal
 * session-set, it is reported through `thread.settled`). `ready`/`idle` are
 * NOT terminal - a thread resting between turns is alive, so a watch closing
 * for them must not emit a "reached a terminal state" notice.
 */
export function isTrueTerminalSessionStatus(status: string | undefined): boolean {
  if (status === undefined) return false;
  return status === "deleted" || status === "settled" || TERMINAL_SESSION_STATUSES.has(status);
}
