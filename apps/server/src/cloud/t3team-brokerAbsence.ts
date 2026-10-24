/**
 * How long the broker has gone without listing a session this server was asked to attach.
 *
 * The broker keeps its session list in memory and drops a session the moment the agent's control
 * socket closes; the agent dials back after a backoff of up to 30 s, and a broker restart or
 * redeploy empties the whole list. A session missing from one list is therefore normal for a live
 * session. Only absence that outlasts every one of those recoveries means the session is gone, so
 * the attach reports it ended only after `SESSION_ABSENT_GRACE_MS` of continuous absence.
 */
export const SESSION_ABSENT_GRACE_MS = 5 * 60_000;

export interface AbsenceTracker {
  readonly observe: (sessions: ReadonlyArray<{ readonly runId: string }>, nowMs: number) => void;
  /** Returns continuous absence measured by the caller's monotonic clock. */
  readonly absent: (sessionId: string, nowMs: number) => number;
  /** The session was found: absence starts over. */
  readonly present: (sessionId: string) => void;
}

export function makeAbsenceTracker(): AbsenceTracker {
  const since = new Map<string, number | null>();
  return {
    observe: (sessions, nowMs) => {
      const present = new Set(sessions.map((session) => session.runId));
      for (const sessionId of since.keys()) {
        if (!present.has(sessionId)) since.set(sessionId, since.get(sessionId) ?? nowMs);
      }
      for (const sessionId of present) since.set(sessionId, null);
    },
    absent: (sessionId, nowMs) => {
      const first = since.get(sessionId) ?? nowMs;
      since.set(sessionId, first);
      return Math.max(0, nowMs - first);
    },
    present: (sessionId) => {
      since.set(sessionId, null);
    },
  };
}
