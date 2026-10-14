/**
 * Cold-cache local compaction route (capability `cold-local-compaction:v1`).
 *
 * A paid provider's own `/compact` re-reads the whole context at uncached prices once the prompt
 * cache has expired. A pack can declare, per driver, that compacting such a cold thread is
 * summarized by a local provider instance instead. The route is data only: the host owns the cold
 * test (idle time, context size, no active run), the summarization and the silent fallback to the
 * driver's native `/compact`.
 *
 * @module cold-local-compaction
 */

export type ColdLocalCompactionRouteDefinition = {
  /** Provider driver whose threads this route applies to. */
  readonly driver: string;
  /** A thread idle for at least this long has an expired prompt cache. */
  readonly ttlMs: number;
  /** Smaller contexts are cheap enough for the native `/compact`. */
  readonly minUsedTokens: number;
  /** Provider instance that writes the summary; it must offer structured text generation. */
  readonly localProviderInstance: string;
  readonly localModel: string;
  readonly enabled: boolean;
};
