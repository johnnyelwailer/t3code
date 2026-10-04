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
 * `CloudSessionPhase`: a session either failed provisioning, ran to its hold
 * time and stopped, or the user cancelled it — all terminal, all history.
 */
export function isTerminalCloudSessionPhase(phase: CloudSessionPhase): boolean {
  return phase === "failed" || phase === "stopped" || phase === "cancelled";
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

/**
 * The sessions the composer's "Run on" menu shows under "Cloud": everything
 * still provisioning (the machine the user just asked for, phases ticking
 * live while the menu polls) PLUS any ready session (it stays a
 * "Ready · Connect" row instead of vanishing the moment it comes up), plus the
 * most recent terminal session (failed or cancelled), so a failed or stopped
 * provisioning is never silently forgotten.
 *
 * List order (newest first, from the server) is preserved.
 */
export function runOnCloudSessions(sessions: readonly CloudSession[]): readonly CloudSession[] {
  const mostRecentTerminal =
    sessions.find((session) => isTerminalCloudSessionPhase(session.phase)) ?? null;
  return sessions.filter(
    (session) => !isTerminalCloudSessionPhase(session.phase) || session === mostRecentTerminal,
  );
}

/**
 * A locally-created session the server's list does not authoritatively cover
 * yet, plus the server-side ids that existed before the create.
 */
export interface LocalCloudSession {
  readonly session: CloudSession;
  readonly knownServerSessionIds: ReadonlySet<string>;
}

/**
 * Union the server's session list with a locally-created session, so a
 * dispatch does not vanish from the UI while GHE indexes the new run.
 *
 * The server's `create` answers with the run's projected session when the run
 * is already visible, and with a `pending:`-tag session when it is not — and
 * the list endpoint only ever reports runs that are visible, under the run's
 * own id. The correlation tag never comes back to the client, so "the local
 * session is covered" can only be detected two ways: the same `sessionId`
 * appears in the server list, or a session that was not there before the
 * create now is (the dispatch surfacing). Until then the local record is
 * shown alongside the server list — no client-side TTL, a runner can
 * legitimately take minutes to pick the job up.
 */
export function mergeLocalCloudSession(
  serverSessions: readonly CloudSession[],
  local: LocalCloudSession | null,
): readonly CloudSession[] {
  if (local === null) return serverSessions;
  if (serverSessions.some((session) => session.sessionId === local.session.sessionId)) {
    return serverSessions;
  }
  const tookOver = serverSessions.some(
    (session) => !local.knownServerSessionIds.has(session.sessionId),
  );
  return tookOver ? serverSessions : [local.session, ...serverSessions];
}
