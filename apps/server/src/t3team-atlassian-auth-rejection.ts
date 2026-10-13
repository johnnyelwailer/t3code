import { AtlassianAuthError, jiraCloudApiBaseUrl } from "@t3tools/integrations-atlassian";
import type { JiraApiAuth } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";

import { atlassianAuths } from "./t3team-atlassian-auth-state.ts";
import {
  flagNeedsReconnectUnsaved,
  reconnectRequiredError,
} from "./t3team-atlassian-auth-staleToken.ts";
import { T3TeamAtlassianError } from "./t3team-atlassian-errors.ts";

/**
 * Jira answers an expired or revoked credential with 401. A 403 is a permission gap on one project
 * or issue, and a 401 "scope does not match" is a missing grant the board-scope notice already
 * owns: neither means the session is dead, so neither may flag the account.
 */
function rejectedBaseUrl(error: unknown): string | undefined {
  const cause = error instanceof T3TeamAtlassianError ? error.cause : error;
  if (!(cause instanceof AtlassianAuthError)) return undefined;
  return cause.status === 401 && cause.missingScope !== true ? cause.baseUrl : undefined;
}

function trimTrailingSlash(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function credentialBaseUrl(auth: JiraApiAuth): string {
  return auth.kind === "oauth"
    ? jiraCloudApiBaseUrl(auth.cloudId)
    : trimTrailingSlash(auth.siteUrl);
}

function accountsRejectedAt(baseUrl: string): ReadonlyArray<string> {
  return [...atlassianAuths]
    .filter(([, auth]) => credentialBaseUrl(auth) === trimTrailingSlash(baseUrl))
    .map(([accountId]) => accountId);
}

/**
 * Fail a call whose credential Jira refused with the typed session-expired error and flag the
 * account, so every later call and the digest report the same state until the user signs in
 * again. Needs no store lock or file system: the flag is written out by the next credential
 * reload. Any other failure, or a credential no stored account uses (a connect attempt with a bad
 * token), passes through untouched.
 */
export function classifyRejectedSession<E>(error: E) {
  const baseUrl = rejectedBaseUrl(error);
  const rejected = baseUrl === undefined ? [] : accountsRejectedAt(baseUrl);
  if (rejected.length === 0) return Effect.fail(error);
  return Effect.sync(() => rejected.forEach(flagNeedsReconnectUnsaved)).pipe(
    Effect.flatMap(() => Effect.fail(reconnectRequiredError())),
  );
}
