import type { CloudSession } from "@t3tools/contracts";

/**
 * The "session ends soon" notice. A cloud session holds its machine for a fixed time
 * (`CLOUD_SESSION_HOLD_CEILING_SECONDS`) and then the fleet reaps it; the server reports what is
 * left as `remainingSeconds` on a ready session. Warn from `SESSION_ENDING_WARNING_SECONDS` on, so
 * the end is never a surprise "reconnecting".
 */
export const SESSION_ENDING_WARNING_SECONDS = 15 * 60;

/**
 * When a ready session's hold ends, from its own record: it started at `startedAt`, and the
 * server's `elapsedSeconds` + `remainingSeconds` is the whole hold. Reading the end off the record
 * (instead of timing when a list arrived) keeps the countdown right however stale the list is.
 * Null when the server could not say (`remainingSeconds` null) or the record has no start.
 */
export function sessionEndsAtMs(
  session: Pick<CloudSession, "startedAt" | "elapsedSeconds" | "remainingSeconds">,
): number | null {
  if (session.remainingSeconds === null || session.startedAt === undefined) return null;
  const startedMs = Date.parse(session.startedAt);
  if (Number.isNaN(startedMs)) return null;
  return startedMs + (session.elapsedSeconds + session.remainingSeconds) * 1000;
}

export function secondsUntil(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((endsAtMs - nowMs) / 1000));
}

export interface SessionEndingNotice {
  readonly title: string;
  readonly description: string;
}

/** The notice for `seconds` left, or null while there is no reason to warn (or nothing is left). */
export function resolveSessionEndingNotice(seconds: number | null): SessionEndingNotice | null {
  if (seconds === null || seconds <= 0 || seconds > SESSION_ENDING_WARNING_SECONDS) return null;
  const minutes = Math.ceil(seconds / 60);
  return {
    title: minutes <= 1 ? "Session ends in under a minute" : `Session ends in ${minutes} min`,
    description: "Work is saved — you can continue in a new session.",
  };
}
