/**
 * Per-broker memory of the `thread.create`s the HOST refused, keyed by child thread id.
 *
 * `spawnThread` fires `thread.create` through the SDK's one-way `sendOneWay`, which does
 * `void call.fire(...)` — there is no caller to reject to, so a refused create that rejected the
 * send would surface as an unhandled rejection and the author's `await agent(...)` would carry on
 * into a turn on a thread that does not exist. The refusal is therefore swallowed HERE, at the
 * one place that can be both silent and ordered, and re-surfaced at the next AWAITED verb on the
 * same child: the `thread.turn` that a `spawnThread(...).askAgent(...)` / `agent()` sends. The
 * body then sees the host's own error, on the awaited call it already handles.
 *
 * The per-run store caps itself so repeated failed spawns cannot grow it without limit. The oldest refusal
 * is dropped first, which degrades a very old child's turn back to the pre-existing behaviour
 * (a turn against a missing thread) rather than failing memory.
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
