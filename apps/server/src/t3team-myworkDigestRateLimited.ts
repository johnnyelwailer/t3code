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

/** How long a last good listing may stand in for a degraded read. */
export const LAST_GOOD_LISTING_MAX_AGE_MS = 30 * 60 * 1000;

type ListingEntry = { readonly repository: string };
export type DigestListingMemory<E extends ListingEntry> = Map<
  string,
  { readonly entries: readonly E[]; readonly at: number }
>;

/**
 * The listing the digest shows for one project this round, and whether it is stale.
 *
 * - A clean read (no per-repository errors) is shown and becomes the project's last good listing.
 * - A read that came back with per-repository errors (signed in, but some repositories could not be
 *   read — in practice the host rate-limiting) keeps its fresh rows and fills each repository that
 *   returned nothing from the last good listing. It never replaces the last good listing.
 * - A failed read falls back to the last good listing only when it failed on a rate limit.
 * A last good listing older than `LAST_GOOD_LISTING_MAX_AGE_MS` is not used.
 */
export function resolveDigestListing<E extends ListingEntry>(input: {
  readonly memory: DigestListingMemory<E>;
  readonly projectId: string;
  readonly nowMs: number;
  readonly read:
    | { readonly _tag: "Success"; readonly entries: readonly E[]; readonly hadErrors: boolean }
    | { readonly _tag: "Failure"; readonly rateLimited: boolean; readonly message: string };
}): { readonly entries: readonly E[]; readonly stale: boolean; readonly note?: string } {
  const { memory, projectId, nowMs, read } = input;
  const remembered = memory.get(projectId);
  const lastGood =
    remembered !== undefined && nowMs - remembered.at <= LAST_GOOD_LISTING_MAX_AGE_MS
      ? remembered.entries
      : undefined;
  if (read._tag === "Success") {
    if (!read.hadErrors) {
      memory.set(projectId, { entries: read.entries, at: nowMs });
      return { entries: read.entries, stale: false };
    }
    const freshRepositories = new Set(read.entries.map((entry) => entry.repository));
    const filled = (lastGood ?? []).filter((entry) => !freshRepositories.has(entry.repository));
    return filled.length > 0
      ? {
          entries: [...read.entries, ...filled],
          stale: true,
          note: RATE_LIMITED_CHANGE_REQUEST_NOTE,
        }
      : { entries: read.entries, stale: false };
  }
  if (read.rateLimited && lastGood !== undefined) {
    return { entries: lastGood, stale: true, note: RATE_LIMITED_CHANGE_REQUEST_NOTE };
  }
  return { entries: [], stale: false, note: read.message };
}
