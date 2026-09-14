import { AtlassianOAuthError } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";

/**
 * Atlassian refresh tokens are single-use and rotate on every refresh. When two installations share
 * one persisted auth secret (a copied profile, two server homes on one machine), the second refresh
 * rotates the token and the first installation's copy is dead for good: every later refresh answers
 * `403 {"error":"unauthorized_client","error_description":"refresh_token is invalid"}`.
 *
 * Retrying cannot help, so the account is flagged "needs reconnect" — in memory and persisted — and
 * every call for it fails with one actionable message instead of the raw 403 until the user
 * reconnects. Only the Atlassian error path reaches the UI (`errorResponse` → `payload.error` →
 * `setError(e.message)`), so the message IS the surface.
 */
export const ATLASSIAN_RECONNECT_REQUIRED_MESSAGE =
  "This Jira connection was refreshed by another installation and can no longer be renewed here. Reconnect Atlassian to continue.";

const REFRESH_TOKEN_INVALID_STATUS = 403;
const REFRESH_TOKEN_INVALID_CODES: ReadonlySet<string> = new Set([
  "unauthorized_client",
  "invalid_grant",
]);

/**
 * The exact signature of a rotated-away refresh token: HTTP 403 with an RFC 6749 body whose `error`
 * is `unauthorized_client` or `invalid_grant` and whose description names the refresh token. Other
 * refresh failures (network, 5xx, revoked app) keep their original error.
 */
export function isRefreshTokenInvalidError(error: unknown): boolean {
  const oauthError =
    error instanceof AtlassianOAuthError
      ? error
      : error instanceof T3TeamAtlassianError && error.cause instanceof AtlassianOAuthError
        ? error.cause
        : null;
  if (!oauthError) return false;
  return (
    oauthError.status === REFRESH_TOKEN_INVALID_STATUS &&
    oauthError.oauthError !== undefined &&
    REFRESH_TOKEN_INVALID_CODES.has(oauthError.oauthError) &&
    (oauthError.oauthErrorDescription ?? "").includes("refresh_token")
  );
}

export function reconnectRequiredError() {
  return new T3TeamAtlassianError({ message: ATLASSIAN_RECONNECT_REQUIRED_MESSAGE });
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
 * Turn a failed refresh into either the actionable reconnect error (flagging the account first, and
 * persisting the flag through `persist`) or the original failure, untouched. Persisting is
 * best-effort: the in-memory flag already protects this process, and a persistence hiccup must not
 * hide the actionable message behind a file-system error.
 */
export function failRefreshOrMarkNeedsReconnect<E>(
  accountId: string,
  error: E,
  persist: Effect.Effect<void, unknown>,
): Effect.Effect<never, E | T3TeamAtlassianError> {
  if (!isRefreshTokenInvalidError(error)) return Effect.fail(error);
  setAccountNeedsReconnect(accountId, true);
  return persist.pipe(
    Effect.ignore,
    Effect.flatMap(() => Effect.fail(reconnectRequiredError())),
  );
}
