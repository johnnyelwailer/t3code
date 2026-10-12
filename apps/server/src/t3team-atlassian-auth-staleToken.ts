import * as Effect from "effect/Effect";
import { JIRA_SESSION_EXPIRED_CODE, T3TeamAtlassianError } from "./t3team-atlassian-http.ts";

/**
 * Atlassian refresh tokens are single-use and rotate on every refresh. When two installations share
 * one persisted auth secret (a copied profile, two server homes on one machine), the second refresh
 * rotates the token and the first installation's copy is dead for good: every later refresh answers
 * `403 {"error":"unauthorized_client","error_description":"refresh_token is invalid"}`.
 *
 * Retrying cannot help, so the account is flagged "needs reconnect" — in memory and persisted — and
 * every call for it fails with the typed session-expired error until the user signs in again. The
 * account itself is never deleted: deleting it made a rotation conflict look like the user had
 * never signed in, on every restart.
 */
export const ATLASSIAN_SESSION_EXPIRED_MESSAGE = "Your Jira session expired. Sign in again.";

/** The typed error the clients turn into their "sign in to Jira again" panel. */
export function reconnectRequiredError() {
  return new T3TeamAtlassianError({
    code: JIRA_SESSION_EXPIRED_CODE,
    message: ATLASSIAN_SESSION_EXPIRED_MESSAGE,
  });
}

const needsReconnectAccountIds = new Set<string>();

export function accountNeedsReconnect(accountId: string): boolean {
  return needsReconnectAccountIds.has(accountId);
}

export function setAccountNeedsReconnect(accountId: string, needsReconnect: boolean): void {
  if (needsReconnect) needsReconnectAccountIds.add(accountId);
  else needsReconnectAccountIds.delete(accountId);
}

export function clearAllNeedsReconnect(): void {
  needsReconnectAccountIds.clear();
}

/**
 * Flag the account and fail with the typed reconnect error, persisting the flag through `persist`.
 * Persisting is best-effort: the in-memory flag already protects this process, and a persistence
 * hiccup must not hide the sign-in prompt behind a file-system error.
 */
export function markNeedsReconnect<E, R>(
  accountId: string,
  persist: Effect.Effect<void, E, R>,
): Effect.Effect<never, T3TeamAtlassianError, R> {
  setAccountNeedsReconnect(accountId, true);
  return persist.pipe(
    Effect.ignore,
    Effect.flatMap(() => Effect.fail(reconnectRequiredError())),
  );
}
