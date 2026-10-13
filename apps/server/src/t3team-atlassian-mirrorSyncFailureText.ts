/**
 * Turns a failed mirror sync step into the one sentence the Jira surfaces show (Settings card,
 * digest notice). The persisted state stores only this sentence: raw messages carry HTTP bodies,
 * URLs and stack traces, and those belong in the server log, never in front of a user.
 */
import {
  AtlassianApiError,
  AtlassianAuthError,
  AtlassianNetworkError,
  AtlassianOAuthSessionExpiredError,
} from "@t3tools/integrations-atlassian";

import { ATLASSIAN_SESSION_EXPIRED_MESSAGE } from "./t3team-atlassian-auth-staleToken.ts";
import {
  JIRA_SESSION_EXPIRED_CODE,
  JIRA_TIMEOUT_CODE,
  T3TeamAtlassianError,
} from "./t3team-atlassian-errors.ts";

export const MIRROR_SYNC_RATE_LIMITED_TEXT =
  "Jira is rate-limiting requests; retrying automatically.";
export const MIRROR_SYNC_UNREACHABLE_TEXT = "Couldn't reach Jira; retrying automatically.";
export const MIRROR_SYNC_ACCESS_DENIED_TEXT =
  "Jira refused access to this project. Check your Jira permissions.";
export const MIRROR_SYNC_JIRA_DOWN_TEXT = "Jira is having trouble right now; retrying automatically.";
export const MIRROR_SYNC_FAILED_TEXT = "Jira sync failed; retrying automatically.";

const maxCauseDepth = 6;

function causeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "cause" in error ? error.cause : undefined;
}

function causeChainSome(error: unknown, matches: (link: unknown) => boolean): boolean {
  let link = error;
  for (let depth = 0; depth < maxCauseDepth && link !== undefined && link !== null; depth++) {
    if (matches(link)) return true;
    link = causeOf(link);
  }
  return false;
}

function hasStatus(link: unknown, status: (code: number) => boolean): boolean {
  return (
    typeof link === "object" &&
    link !== null &&
    "status" in link &&
    typeof link.status === "number" &&
    status(link.status)
  );
}

/** A 429 anywhere in the cause chain: Jira asked us to slow down. */
export function isRateLimitedFailure(error: unknown): boolean {
  return causeChainSome(error, (link) => hasStatus(link, (code) => code === 429));
}

function isSessionExpired(link: unknown): boolean {
  return (
    (link instanceof T3TeamAtlassianError && link.code === JIRA_SESSION_EXPIRED_CODE) ||
    link instanceof AtlassianOAuthSessionExpiredError
  );
}

function isUnreachable(link: unknown): boolean {
  return (
    link instanceof AtlassianNetworkError ||
    (link instanceof T3TeamAtlassianError && link.code === JIRA_TIMEOUT_CODE)
  );
}

function isAccessDenied(link: unknown): boolean {
  return link instanceof AtlassianAuthError;
}

function isJiraServerError(link: unknown): boolean {
  return link instanceof AtlassianApiError && link.status >= 500;
}

export function describeMirrorSyncFailure(error: unknown): string {
  if (causeChainSome(error, isSessionExpired)) return ATLASSIAN_SESSION_EXPIRED_MESSAGE;
  if (isRateLimitedFailure(error)) return MIRROR_SYNC_RATE_LIMITED_TEXT;
  if (causeChainSome(error, isUnreachable)) return MIRROR_SYNC_UNREACHABLE_TEXT;
  if (causeChainSome(error, isAccessDenied)) return MIRROR_SYNC_ACCESS_DENIED_TEXT;
  if (causeChainSome(error, isJiraServerError)) return MIRROR_SYNC_JIRA_DOWN_TEXT;
  return MIRROR_SYNC_FAILED_TEXT;
}
