import type { IntegrationAccountRef } from "@t3tools/integrations-core";

import { isRateLimitedFailure } from "./t3team-atlassian-mirrorSyncFailureText.ts";

export type T3TeamAtlassianMirrorSyncRequest = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
};

export type MirrorSyncIdentity = { provider: string; accountId: string; externalProjectId: string };

// ─── Constants ──────────────────────────────────────────────────────────────

/** Pages fetched before pausing to avoid hammering Jira. */
export const maxPagesPerBurst = 10;
export const burstPause = "3 seconds";

/**
 * Hard cap on pages per walk — prevents runaway loops. A capped catch-up walk
 * resumes from its persisted watermark on the next walk; a capped reconcile is
 * incomplete and does not prune.
 */
export const maxPagesPerWalk = 200;

/** Wake interval between walks once caught up (normal polling). */
export const normalSleepMs = 90_000; // 90 seconds

/** Full-reconcile interval: once per ~24 h. */
export const reconcileIntervalMs = 24 * 60 * 60 * 1_000;

/**
 * Floor for a catch-up walk's relative lookback (`updated >= -Nm`), so a
 * watermark that sits just behind "now" still re-reads the last few minutes.
 * Over-fetch is harmless: upserts only overwrite strictly newer rows.
 */
const minCatchUpLookbackMinutes = 15;

/**
 * Overlap behind the watermark so clock skew between this machine and Jira
 * (and JQL's minute granularity) can't drop updates at the boundary.
 */
const watermarkOverlapMinutes = 5;

/**
 * Lookback reaching back to the watermark (minus the overlap), however long ago
 * that was. JQL's absolute datetimes are read in the Jira user's profile
 * timezone, so the walk sends the bound as relative minutes instead.
 * `undefined` (no watermark yet) means walk the whole project from the oldest change.
 */
export function computeWatermarkLookbackMinutes(input: {
  readonly nowMs: number;
  readonly watermarkMs: number | undefined;
}): number | undefined {
  if (input.watermarkMs === undefined) {
    return undefined;
  }
  const elapsedMinutes = Math.ceil(Math.max(0, input.nowMs - input.watermarkMs) / 60_000);
  return Math.max(minCatchUpLookbackMinutes, elapsedMinutes + watermarkOverlapMinutes);
}

export const mirrorPageSize = 100;

/**
 * Backoff bounds for failed walks (doc 33 §4.9: honor rate limits). A
 * rate-limited walk jumps straight to a 5-minute pause; other failures double
 * the previous sleep. Both are capped, and any successful walk resets to the
 * normal cadence.
 */
const rateLimitedSleepMs = 5 * 60_000;
const maxSleepMs = 15 * 60_000;

/**
 * Next loop sleep given the walk outcome: success resets to the 90 s cadence;
 * a 429 anywhere in the error's cause chain jumps to the rate-limit pause;
 * any other failure doubles the previous sleep (capped) so a persistently
 * failing walk cannot hammer Jira every 90 s.
 */
export function nextMirrorSleepMs(previousSleepMs: number, outcome: "ok" | unknown): number {
  if (outcome === "ok") {
    return normalSleepMs;
  }
  if (isRateLimitedFailure(outcome)) {
    return Math.min(Math.max(rateLimitedSleepMs, previousSleepMs), maxSleepMs);
  }
  return Math.min(Math.max(previousSleepMs * 2, normalSleepMs * 2), maxSleepMs);
}
