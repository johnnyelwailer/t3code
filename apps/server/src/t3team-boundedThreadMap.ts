/**
 * Insert-time-bounded per-thread map (GHE #203): a plain `Map` keyed by
 * threadId grows without limit for threads that never idle (killed process,
 * crashed provider, a client that never sends a turn-end). This wrapper caps
 * the tracked key count and evicts the oldest entry — a `Map` preserves
 * insertion order, so "oldest" is simply the first key — the moment a NEW
 * key would push the map over `max`. Eviction never fires for a `set()` on a
 * key already tracked (updating an existing entry never evicts anything).
 *
 * `onEvict` lets a caller clean up side state that is keyed the same way
 * (e.g. a pending-generation timer) when its owning entry is evicted here,
 * so two maps keyed by the same threadId never drift out of sync.
 */
export function createBoundedThreadMap<V>(max: number, onEvict?: (key: string, value: V) => void) {
  const map = new Map<string, V>();

  return {
    get: (key: string) => map.get(key),
    has: (key: string) => map.has(key),
    set: (key: string, value: V) => {
      if (!map.has(key) && map.size >= max) {
        const oldestKey = map.keys().next().value;
        if (oldestKey !== undefined) {
          const oldestValue = map.get(oldestKey);
          map.delete(oldestKey);
          if (oldestValue !== undefined) onEvict?.(oldestKey, oldestValue);
        }
      }
      map.set(key, value);
    },
    delete: (key: string) => map.delete(key),
    get size() {
      return map.size;
    },
  };
}
