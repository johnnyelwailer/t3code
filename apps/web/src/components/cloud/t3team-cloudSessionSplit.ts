import type { CloudSession, CloudSessionPhase } from "@t3tools/contracts";

/**
 * Split the cloud session list into what the panel surfaces by default
 * (sessions still doing work) and what belongs in the collapsed history
 * (sessions that have ended).
 *
 * Pure and React-free, like `t3team-cloudSessionProvisionPresentation`, so
 * the panel's split rule has exactly one home and can be tested without
 * rendering.
 */

/**
 * Phases in which a session has no live work left. Mirrors the contract's
 * `CloudSessionPhase`: there is no "released" or "cancelled" — a session
 * either failed provisioning or ran to its hold time and stopped.
 */
export function isTerminalCloudSessionPhase(phase: CloudSessionPhase): boolean {
  return phase === "failed" || phase === "stopped";
}

/**
 * How many terminal sessions the panel shows under history. The panel is not
 * the place to browse a backlog of finished sessions; the provider's run log
 * (via the details link) is.
 */
export const CLOUD_SESSION_HISTORY_LIMIT = 5;

export interface CloudSessionListSplit {
  /** Sessions still meaningful: provisioning or ready. */
  readonly active: readonly CloudSession[];
  /**
   * Terminal sessions in list order. The server returns the provider's run
   * log, newest first, so this is newest-first; the contract carries no
   * timestamps of its own for the client to re-sort by.
   */
  readonly history: readonly CloudSession[];
  /** Terminal sessions beyond the cap. */
  readonly hiddenHistoryCount: number;
}

/**
 * Split a session list into active sessions and capped history, preserving
 * list order (the server's newest-first order) in both halves.
 */
export function splitCloudSessions(
  sessions: readonly CloudSession[],
  historyLimit = CLOUD_SESSION_HISTORY_LIMIT,
): CloudSessionListSplit {
  const active: CloudSession[] = [];
  const terminal: CloudSession[] = [];
  for (const session of sessions) {
    if (isTerminalCloudSessionPhase(session.phase)) terminal.push(session);
    else active.push(session);
  }
  const history = terminal.slice(0, historyLimit);
  return {
    active,
    history,
    hiddenHistoryCount: Math.max(0, terminal.length - history.length),
  };
}
