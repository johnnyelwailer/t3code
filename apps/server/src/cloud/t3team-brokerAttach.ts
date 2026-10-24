import { CloudSessionFailedError, type CloudSessionAttachInput } from "@t3tools/contracts";
import {
  SESSION_ABSENT_GRACE_MS,
  SESSION_EXPIRED_ABSENT_GRACE_MS,
} from "./t3team-brokerAbsence.ts";

/**
 * The listed session an attach reaches: the one asked for, else — a workspace's sessions share
 * their environment, since the snapshot keeps its id — the live one serving the same environment.
 * Two live sessions in one workspace (started side by side) serve the same environment: the newest
 * run wins, so reconnects stay on one machine instead of following list order.
 */
export function sessionToAttach<
  S extends { readonly runId: string; readonly environmentId?: string | null | undefined },
>(sessions: readonly S[], input: CloudSessionAttachInput): S | undefined {
  const asked = sessions.find(
    (s) =>
      s.runId === input.sessionId &&
      s.environmentId &&
      (input.environmentId === undefined || s.environmentId === input.environmentId),
  );
  if (asked !== undefined || input.environmentId === undefined) return asked;
  return sessions
    .filter((s) => s.environmentId === input.environmentId)
    .reduce<S | undefined>(
      (newest, s) => (newest === undefined || Number(s.runId) > Number(newest.runId) ? s : newest),
      undefined,
    );
}

/**
 * Why no session can be attached. A session the broker lists without an environment id is still
 * starting (its machine has not registered yet), and one it does not list may be reconnecting to
 * the broker: both are retryable (`unknown_session`). A session missing for longer than
 * `SESSION_ABSENT_GRACE_MS` — past every reconnect and broker restart — has ended, which a client
 * must stop retrying (`session_ended`).
 */
export function attachFailure(
  sessions: ReadonlyArray<{ readonly runId: string }>,
  input: CloudSessionAttachInput,
  absentForMs: number,
  nowMs = 0,
): CloudSessionFailedError {
  if (sessions.some((s) => s.runId === input.sessionId)) {
    return new CloudSessionFailedError({
      reason: "unknown_session",
      message: "That cloud session is not running yet: it is still starting.",
    });
  }
  const deadline = input.endsAt === undefined ? NaN : Date.parse(input.endsAt);
  const grace = deadline <= nowMs ? SESSION_EXPIRED_ABSENT_GRACE_MS : SESSION_ABSENT_GRACE_MS;
  return absentForMs >= grace
    ? new CloudSessionFailedError({
        reason: "session_ended",
        message: "That cloud session has ended.",
      })
    : new CloudSessionFailedError({
        reason: "unknown_session",
        message:
          "That cloud session is not listed by the broker right now. It may be reconnecting.",
      });
}
