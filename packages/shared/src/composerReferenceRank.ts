/**
 * Shared smart ranker for the composer's reference menus (Jira work items and pull requests).
 *
 * The settled signal order (docs/design/composer-work-item-and-multirepo-pr-refs.md):
 *   1. exact / prefix match on the issue key or pull-request number the user typed,
 *   2. referenced in this thread,
 *   3. last-used anywhere (recency),
 *   4. use count,
 *   5. host `updatedAt` (today's only host-side signal).
 *
 * Keeping the ranker here rather than inside either menu keeps the two menus ranking
 * identically — a work item and a pull request with the same signals must land in the same
 * order. The caller supplies the signals; this module only orders.
 */

/** Reference-recency signal for one item. All three come from the recency log (U2 store). */
export interface ComposerReferenceRecency {
  /** Epoch ms of the most recent use of this reference anywhere, or null when never used. */
  readonly lastUsedAt: number | null;
  /** How many times this reference has been used anywhere. */
  readonly useCount: number;
  /** True when the reference was used in the current thread. */
  readonly referencedInThread: boolean;
}

export const EMPTY_COMPOSER_REFERENCE_RECENCY: ComposerReferenceRecency = {
  lastUsedAt: null,
  useCount: 0,
  referencedInThread: false,
};

/** A single menu row the ranker can order. `Entry` adds the caller's own fields. */
export interface ComposerReferenceCandidate {
  /** Stable identity of the reference — the issue key, or `<repo>#<number>`. */
  readonly refId: string;
  /** The key or pull-request number the user typed (the trigger query). */
  readonly query: string;
  /** The candidate's own key or pull-request number, the thing the query matches against. */
  readonly matchKey: string;
  readonly recency: ComposerReferenceRecency;
  /** Host `updatedAt` as epoch ms; null when the host did not report one. */
  readonly updatedAt: number | null;
}

/**
 * True when `query` is the whole of `matchKey`. Case is ignored so `nx-12` matches `NX-12`;
 * an empty query never matches exactly (a bare prefix has no exact target yet).
 */
export function isExactComposerReferenceMatch(query: string, matchKey: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) return false;
  return trimmed.toLowerCase() === matchKey.toLowerCase();
}

/**
 * True when `query` is a proper prefix of `matchKey` — `NX-12` is a prefix of `NX-123` but not
 * of `NX-12` (that is an exact match) and not of `NX-1234` in the other direction.
 */
export function isPrefixComposerReferenceMatch(query: string, matchKey: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) return false;
  if (isExactComposerReferenceMatch(query, matchKey)) return false;
  return matchKey.toLowerCase().startsWith(trimmed.toLowerCase());
}

function comparator(left: ComposerReferenceCandidate, right: ComposerReferenceCandidate): number {
  const exactness =
    Number(isExactComposerReferenceMatch(right.query, right.matchKey)) -
    Number(isExactComposerReferenceMatch(left.query, left.matchKey));
  if (exactness !== 0) return exactness;

  const prefix =
    Number(isPrefixComposerReferenceMatch(right.query, right.matchKey)) -
    Number(isPrefixComposerReferenceMatch(left.query, left.matchKey));
  if (prefix !== 0) return prefix;

  const threadRef = Number(right.recency.referencedInThread) - Number(left.recency.referencedInThread);
  if (threadRef !== 0) return threadRef;

  // "Last-used anywhere, decayed": newer use outranks older; never-used (null) sorts last.
  const lastUsedAt = (right.recency.lastUsedAt ?? 0) - (left.recency.lastUsedAt ?? 0);
  if (lastUsedAt !== 0) return lastUsedAt;

  const useCount = right.recency.useCount - left.recency.useCount;
  if (useCount !== 0) return useCount;

  const updatedAt = (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
  if (updatedAt !== 0) return updatedAt;

  return left.refId.localeCompare(right.refId);
}

/**
 * Order candidates best-first. Stable-free: the comparator ends on `refId` so two otherwise
 * identical rows land in a deterministic place. The caller applies its own result limit.
 */
export function rankComposerReferences<Entry extends ComposerReferenceCandidate>(
  entries: ReadonlyArray<Entry>,
): ReadonlyArray<Entry> {
  // `.sort()` on a copy, not `.toSorted()`: this runs on Hermes, which has no ES2023 array
  // methods (same constraint as the pull-request matcher above).
  return [...entries].sort(comparator);
}
