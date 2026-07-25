/**
 * A Map with a hard cap on entry count, evicting the least-recently-used
 * entry once the cap is exceeded. Reuse this instead of a bare `Map` for any
 * in-memory cache that can grow unboundedly (per-ticket, per-source, etc).
 *
 * Recency is tracked via `Map` insertion order: `get` and `set` both move the
 * touched key to the end, and eviction removes from the front.
 */
export class BoundedMap<K, V> {
  private readonly maxEntries: number;
  private readonly map = new Map<K, V>();

  constructor(options: { readonly maxEntries: number }) {
    this.maxEntries = Math.max(1, Math.trunc(options.maxEntries));
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /** Peek without affecting recency order. */
  peek(key: K): V | undefined {
    return this.map.get(key);
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }
}
