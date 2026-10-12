import {
  PullRequestOperationError,
  PullRequestUnavailableError,
  type ThreadPullRequestSnapshot,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";

const isOperationError = Schema.is(PullRequestOperationError);
const isUnavailableError = Schema.is(PullRequestUnavailableError);

/** First pause after a link the host cannot resolve; each further failure doubles it. */
const UNRESOLVABLE_BACKOFF_BASE_MS = 15 * 60 * 1_000;
const UNRESOLVABLE_BACKOFF_MAX_MS = 24 * 60 * 60 * 1_000;
/**
 * A host that signs its avatar URLs (GHE appends a fresh `?token=` to every read) hands out a
 * URL that may stop working, so the stored one is replaced this often even when nothing else
 * changed.
 */
const AVATAR_REFRESH_MS = 60 * 60 * 1_000;

/**
 * The avatar without its query and fragment. GHE signs avatar URLs with a token that differs on
 * every read, so the whole URL says nothing about whether the picture changed.
 */
export function avatarIdentity(url: string | null | undefined): string | null {
  if (url === null || url === undefined) return null;
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
  }
}

/** The avatar differs only by its signature, and the stored one is old enough to replace. */
export function avatarRefreshDue(
  stored: ThreadPullRequestSnapshot,
  latestAvatarUrl: string | null | undefined,
  nowMs: number,
): boolean {
  const storedUrl = stored.author?.avatarUrl ?? null;
  if (storedUrl === (latestAvatarUrl ?? null)) return false;
  return nowMs - Date.parse(stored.syncedAt) >= AVATAR_REFRESH_MS;
}

/**
 * The host answered that the pull request is not there for this credential (a link recorded
 * under the wrong host, a repository gone or out of reach), or that no project can read that
 * host at all. Asking again does not change the answer, unlike a signed-out CLI or a network
 * failure, which the user or time fixes.
 */
export function isUnresolvableRead(cause: Cause.Cause<unknown>): boolean {
  const error = Cause.squash(cause);
  return (
    (isOperationError(error) && error.reason === "not-found") ||
    (isUnavailableError(error) && error.reason === "provider-unsupported")
  );
}

/** How long to leave a link alone after its `failures`-th unresolvable read in a row. */
export function unresolvableBackoffMs(failures: number): number {
  return Math.min(
    UNRESOLVABLE_BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1),
    UNRESOLVABLE_BACKOFF_MAX_MS,
  );
}
