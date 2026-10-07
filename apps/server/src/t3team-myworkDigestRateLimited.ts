/**
 * Whether a change-request read failed because the host is rate-limiting (or the client paused
 * reads until the limit resets). Only then may the digest fall back to what it read last: any other
 * failure (signed out, token revoked, account switched, repo gone) must not keep showing old data.
 */
export function isRateLimitedFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth++) {
    const candidate = current as { readonly reason?: unknown; readonly _tag?: unknown };
    if (candidate.reason === "rate-limited") return true;
    if (typeof candidate._tag === "string" && candidate._tag.includes("RateLimit")) return true;
    current = (current as { readonly cause?: unknown }).cause;
  }
  return false;
}

/** The digest's note when it shows change requests from before the host paused reads. */
export const RATE_LIMITED_CHANGE_REQUEST_NOTE =
  "The code host is rate-limiting reads: pull requests are shown as of the last successful read.";
