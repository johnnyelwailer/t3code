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

/** The digest's note when some of a project's change requests could not be read this round. */
export const INCOMPLETE_CHANGE_REQUEST_NOTE =
  "Some repositories could not be read just now: their pull requests are shown as last seen.";

/** How long a repository's last seen rows may stand in for a read that missed it. */
export const LAST_GOOD_LISTING_MAX_AGE_MS = 30 * 60 * 1000;

type ListingEntry = { readonly host: string; readonly repository: string };
/** Per app project, the last rows each repository (host/owner/repo) returned, and when. */
export type DigestListingMemory<E extends ListingEntry> = Map<
  string,
  Map<string, { readonly entries: readonly E[]; readonly at: number }>
>;

const repositoryKey = (entry: ListingEntry) => `${entry.host}/${entry.repository}`;

/**
 * The listing the digest shows for one project this round, and whether it may be incomplete.
 *
 * Every read refreshes the memory of each repository it returned rows for. A read that came back
 * with per-repository errors (some repositories could not be read: a rate limit, a lost repo, a
 * signed-out host) keeps its fresh rows, fills every remembered repository it returned nothing for,
 * and is marked stale even when there was nothing to fill. A failed read is filled entirely from
 * memory, but only when it failed on a rate limit. Memory older than
 * `LAST_GOOD_LISTING_MAX_AGE_MS` is not used. A repository that is legitimately empty now can be
 * refilled by a degraded read; that lasts at most the max age and is marked stale.
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
  const byRepository = memory.get(projectId) ?? new Map();
  memory.set(projectId, byRepository);
  const remembered = (except: ReadonlySet<string>) =>
    [...byRepository.entries()]
      .filter(([key, seen]) => !except.has(key) && nowMs - seen.at <= LAST_GOOD_LISTING_MAX_AGE_MS)
      .flatMap(([, seen]) => seen.entries);
  if (read._tag === "Success") {
    const fresh = new Map<string, E[]>();
    for (const entry of read.entries) {
      const key = repositoryKey(entry);
      fresh.set(key, [...(fresh.get(key) ?? []), entry]);
    }
    for (const [key, entries] of fresh) byRepository.set(key, { entries, at: nowMs });
    if (!read.hadErrors) return { entries: read.entries, stale: false };
    return {
      entries: [...read.entries, ...remembered(new Set(fresh.keys()))],
      stale: true,
      note: INCOMPLETE_CHANGE_REQUEST_NOTE,
    };
  }
  if (read.rateLimited) {
    return { entries: remembered(new Set()), stale: true, note: INCOMPLETE_CHANGE_REQUEST_NOTE };
  }
  return { entries: [], stale: false, note: read.message };
}
