/**
 * Keep one-way creation refusals for the next awaited child turn.
 * The bounded, per-broker cache loses older refusals on eviction or restart.
 */

/** A refusal wrapper, so a thrown `undefined` is still distinguishable from "no refusal". */
export type ChildSpawnRefusal = { readonly error: unknown };

export interface ChildSpawnRefusalStore {
  /** Remember a refused create for `threadId` (re-recording refreshes its recency). */
  readonly record: (threadId: string, error: unknown) => void;
  /** Forget `threadId` — a later create succeeded, so the child really exists now. */
  readonly clear: (threadId: string) => void;
  /** The refusal standing for `threadId`, or `undefined` when the child is (or may be) there. */
  readonly refusalFor: (threadId: string) => ChildSpawnRefusal | undefined;
}

const DEFAULT_LIMIT = 64;

export function makeChildSpawnRefusalStore(limit = DEFAULT_LIMIT): ChildSpawnRefusalStore {
  const refusals = new Map<string, ChildSpawnRefusal>();
  const cap = Math.max(1, Math.trunc(limit));
  return {
    record: (threadId, error) => {
      refusals.delete(threadId); // re-insert last: insertion order IS the eviction order
      refusals.set(threadId, { error });
      for (const oldest of refusals.keys()) {
        if (refusals.size <= cap) return;
        refusals.delete(oldest);
      }
    },
    clear: (threadId) => refusals.delete(threadId),
    refusalFor: (threadId) => refusals.get(threadId),
  };
}
