import {
  AtlassianOAuthError,
  AtlassianOAuthSessionExpiredError,
} from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";

import { T3TeamAtlassianError } from "./t3team-atlassian-errors.ts";

/**
 * Secret-free diagnostics for the Atlassian token refresh. Nothing here ever logs a token, the
 * client secret, or the raw token-endpoint body: only the HTTP status, the RFC 6749 `error` code,
 * and whether a client secret was configured at all.
 */
export type RefreshFailureDetails = {
  readonly httpStatus?: number;
  readonly oauthError?: string;
  /** True for a dead refresh token (invalid_grant / "refresh_token is invalid"). */
  readonly refreshTokenInvalid: boolean;
  /** True when Atlassian answered with a session-expired class response at all. */
  readonly sessionExpiredResponse: boolean;
};

export function refreshFailureDetails(error: unknown): RefreshFailureDetails {
  const cause = error instanceof T3TeamAtlassianError ? error.cause : error;
  if (cause instanceof AtlassianOAuthSessionExpiredError) {
    const description = cause.oauthErrorDescription ?? "";
    const body = typeof cause.cause === "string" ? cause.cause : "";
    const refreshTokenInvalid =
      cause.oauthError === "invalid_grant" ||
      /refresh_token is invalid/i.test(description) ||
      // Non-JSON body: the package only raises this for the documented description.
      (cause.oauthError === undefined && /refresh_token is invalid/i.test(body));
    return {
      ...(cause.status !== undefined ? { httpStatus: cause.status } : {}),
      ...(cause.oauthError !== undefined ? { oauthError: cause.oauthError } : {}),
      refreshTokenInvalid,
      sessionExpiredResponse: true,
    };
  }
  if (cause instanceof AtlassianOAuthError) {
    return {
      ...(cause.status !== undefined ? { httpStatus: cause.status } : {}),
      ...(cause.oauthError !== undefined ? { oauthError: cause.oauthError } : {}),
      refreshTokenInvalid: false,
      sessionExpiredResponse: false,
    };
  }
  return { refreshTokenInvalid: false, sessionExpiredResponse: false };
}

export type RefreshOutcome =
  | "refreshed"
  | "adopted-newer-token"
  | "refresh-token-invalid"
  | "client-rejected"
  | "missing-client-secret"
  | "missing-client-id"
  | "copied-secret"
  | "failed";

export function logRefreshAttempt(input: {
  readonly accountId: string;
  readonly outcome: RefreshOutcome;
  readonly clientSecretPresent: boolean;
  readonly details?: RefreshFailureDetails;
}) {
  const attributes = {
    "atlassian.account_id": input.accountId,
    "atlassian.refresh.outcome": input.outcome,
    "atlassian.refresh.client_secret_present": input.clientSecretPresent ? "yes" : "no",
    ...(input.details?.httpStatus !== undefined
      ? { "atlassian.refresh.http_status": input.details.httpStatus }
      : {}),
    ...(input.details?.oauthError !== undefined
      ? { "atlassian.refresh.oauth_error": input.details.oauthError }
      : {}),
  };
  const log =
    input.outcome === "refreshed" || input.outcome === "adopted-newer-token"
      ? Effect.logInfo("Atlassian token refresh")
      : Effect.logWarning("Atlassian token refresh failed");
  return log.pipe(
    Effect.annotateLogs(attributes),
    Effect.withSpan("t3team.atlassian.oauth.refresh", { attributes }),
  );
}

export type NeedsReconnectReason =
  | "refresh-token-invalid"
  | "no-refresh-token"
  | "jira-rejected-access-token";

export function logNeedsReconnect(accountId: string, reason: NeedsReconnectReason) {
  const attributes = {
    "atlassian.account_id": accountId,
    "atlassian.needs_reconnect.reason": reason,
  };
  return Effect.logWarning("Atlassian account flagged needs-reconnect").pipe(
    Effect.annotateLogs(attributes),
    Effect.withSpan("t3team.atlassian.needs_reconnect", { attributes }),
  );
}
