/**
 * Bounded, error-aware memoization for Tempo plan issue-id → project-key
 * resolution (see t3work-tempo.ts). Split out from t3work-tempo.ts to keep
 * that file under the additive-file LOC cap.
 *
 * Issue project keys never change once resolved, so genuine resolutions
 * (including a confirmed "issue not found", i.e. a successful lookup
 * returning null) are cached indefinitely. A thrown/transient failure
 * (network hiccup, rate limit) is NOT cached so a later call gets a fresh
 * attempt instead of being stuck with a permanent false-negative. Bounded
 * with simple insertion-order eviction so a long-running server doesn't grow
 * this map without limit.
 */

const issueKeyCache = new Map<string, string | null>();
const ISSUE_KEY_CACHE_MAX = 2000;

/** Drop all cached issue→project-key lookups (e.g. on Atlassian auth replace). */
export function invalidateT3workTempoIssueKeyCache(): void {
  issueKeyCache.clear();
}

function setIssueKeyCache(issueId: string, key: string | null): void {
  if (!issueKeyCache.has(issueId) && issueKeyCache.size >= ISSUE_KEY_CACHE_MAX) {
    const oldestKey = issueKeyCache.keys().next().value;
    if (oldestKey !== undefined) issueKeyCache.delete(oldestKey);
  }
  issueKeyCache.set(issueId, key);
}

/**
 * Wraps an uncached issue-id → project-key resolver with the bounded,
 * error-aware cache. Pure (no Effect/provider dependency) so the caching
 * behavior — errors never cached, genuine null results are — is directly
 * unit-testable.
 */
export function withT3workIssueKeyCache(
  resolveUncached: (issueId: string) => Promise<string | null>,
): (issueId: string) => Promise<string | null> {
  return async (issueId) => {
    const cached = issueKeyCache.get(issueId);
    if (cached !== undefined) return cached;
    try {
      const key = await resolveUncached(issueId);
      setIssueKeyCache(issueId, key);
      return key;
    } catch {
      // Transient failure — don't cache it as a permanent "not found".
      return null;
    }
  };
}
