/**
 * Provider usage burn-rate history — a minimal bounded in-memory time
 * series of the usage percentages the shared capacity path reads
 * (`t3team-providerCapacityWindows`). No persistence, no second data path:
 * the broker records the same samples it renders, so burn rates only ever
 * describe what this shared implementation actually observed.
 *
 * Honesty rules: a rate is reported only when at least two samples cover a
 * positive span with a positive delta (a flat or dropping percent is a
 * window reset or idle time, not evidence of forward consumption).
 *
 * @module t3team-providerUsageHistory
 */

export interface ProviderUsageBurn {
  /** Consumption in percentage points per hour over the observed span. */
  readonly percentPerHour: number;
  /** How many minutes of samples the rate was computed over. */
  readonly sampleSpanMinutes: number;
  readonly sampleCount: number;
}

interface UsageSampleEntry {
  readonly t: number;
  readonly percent: number;
}

const HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** One entry per key per minute is enough; beyond that the ring trims. */
const HISTORY_MAX_ENTRIES = 4_000;
const HISTORY_DEDUPE_MS = 60 * 1000;
/** Shorter spans are noise, not a rate. */
const HISTORY_MIN_SPAN_MS = 2 * 60 * 1000;

/** One record per key per minute (last write wins inside the minute). */
const samples = new Map<string, UsageSampleEntry[]>();

/**
 * Records one observed percentage for a window key (e.g.
 * `codex:primary` or `hub:cliproxy:cursor@a:other_models`). Bounded:
 * entries older than 24h and duplicates within a minute are dropped, and
 * the ring trims to `HISTORY_MAX_ENTRIES` total.
 */
export const recordUsageSample = (key: string, percent: number, now: number): void => {
  if (!Number.isFinite(percent)) return;
  let entries = samples.get(key);
  if (entries === undefined) {
    entries = [];
    samples.set(key, entries);
  }
  const last = entries[entries.length - 1];
  if (last !== undefined && now - last.t < HISTORY_DEDUPE_MS) {
    entries[entries.length - 1] = { t: now, percent };
    return;
  }
  entries.push({ t: now, percent });
  while (entries.length > 0 && now - entries[0]!.t > HISTORY_MAX_AGE_MS) entries.shift();
  let total = 0;
  for (const list of samples.values()) total += list.length;
  if (total > HISTORY_MAX_ENTRIES) {
    // Oldest-first trim across keys keeps the bound without a second index.
    for (const [k, list] of samples) {
      if (total <= HISTORY_MAX_ENTRIES) break;
      while (list.length > 0 && total > HISTORY_MAX_ENTRIES) {
        list.shift();
        total -= 1;
      }
      if (list.length === 0) samples.delete(k);
    }
  }
};

/**
 * The honest burn rate for a key: undefined when there are fewer than two
 * samples, the span is too short, or the percent did not increase.
 */
export const burnRateForKey = (key: string, now: number): ProviderUsageBurn | undefined => {
  const entries = samples.get(key);
  if (entries === undefined || entries.length < 2) return undefined;
  const usable = entries.filter((entry) => now - entry.t <= HISTORY_MAX_AGE_MS);
  if (usable.length < 2) return undefined;
  const oldest = usable[0]!;
  const newest = usable[usable.length - 1]!;
  const spanMs = newest.t - oldest.t;
  if (spanMs < HISTORY_MIN_SPAN_MS) return undefined;
  const delta = newest.percent - oldest.percent;
  if (delta <= 0) return undefined;
  return {
    percentPerHour: (delta / spanMs) * 3_600_000,
    sampleSpanMinutes: spanMs / 60_000,
    sampleCount: usable.length,
  };
};

/** Test/distribution hook: forget all recorded samples. */
export const clearUsageSampleHistory = (): void => {
  samples.clear();
};
