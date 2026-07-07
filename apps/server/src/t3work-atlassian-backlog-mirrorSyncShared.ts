import type { IntegrationAccountRef } from "@t3tools/integrations-core";

export type T3workAtlassianMirrorSyncRequest = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
};

export type MirrorSyncIdentity = { provider: string; accountId: string; externalProjectId: string };

// ─── Constants ──────────────────────────────────────────────────────────────

/** Pages fetched before pausing to avoid hammering Jira. */
export const maxPagesPerBurst = 10;
export const burstPause = "3 seconds";

/** Hard cap on pages per incremental walk — prevents runaway loops. */
export const maxPagesPerWalk = 200;

/** Incremental wake interval (normal polling). */
export const normalSleepMs = 90_000; // 90 seconds

/** Full-reconcile interval: once per ~24 h. */
export const reconcileIntervalMs = 24 * 60 * 60 * 1_000;

/**
 * Minimum relative lookback for incremental walks: fetch issues updated in the
 * last N minutes (`updated >= -Nm`). Comfortably larger than the ~90 s poll
 * interval so brief hiccups don't drop updates. Over-fetch is harmless (upserts
 * dedupe) and typically stays within one page.
 */
export const minIncrementalLookbackMinutes = 15;

/**
 * Slack added on top of the elapsed-time-based lookback so clock skew between
 * this machine and Jira (and JQL's minute granularity) can't drop updates.
 */
export const incrementalLookbackSlackMinutes = 5;

/**
 * Cap on the widened lookback. Anything older than this is the 24 h
 * reconcile's job anyway, and an uncapped `updated >= -Nm` after a very long
 * suspend would degenerate into a full-project walk on the incremental path.
 */
export const maxIncrementalLookbackMinutes = 24 * 60;

/**
 * Lookback for an incremental walk, widened by the time since the last
 * successful walk so a gap (laptop suspend, repeated walk failures) doesn't
 * drop updates until the 24 h reconcile. `lastSuccessfulWalkMs` of 0 (no
 * successful walk yet) yields the max lookback via the cap.
 */
export function computeIncrementalLookbackMinutes(input: {
  readonly nowMs: number;
  readonly lastSuccessfulWalkMs: number;
}): number {
  const elapsedMinutes = Math.ceil(Math.max(0, input.nowMs - input.lastSuccessfulWalkMs) / 60_000);
  return Math.min(
    Math.max(minIncrementalLookbackMinutes, elapsedMinutes + incrementalLookbackSlackMinutes),
    maxIncrementalLookbackMinutes,
  );
}

/** Mirror page size. */
export const mirrorPageSize = 100;

/**
 * Backoff bounds for failed walks (doc 33 §4.9: honor rate limits). A
 * rate-limited walk jumps straight to a 5-minute pause; other failures double
 * the previous sleep. Both are capped, and any successful walk resets to the
 * normal cadence.
 */
export const rateLimitedSleepMs = 5 * 60_000;
export const maxSleepMs = 15 * 60_000;

function causeChainHasStatus429(error: unknown, depth = 0): boolean {
  if (depth > 5 || error === null || typeof error !== "object") {
    return false;
  }
  const record = error as { status?: unknown; cause?: unknown };
  if (record.status === 429) {
    return true;
  }
  return causeChainHasStatus429(record.cause, depth + 1);
}

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
  if (causeChainHasStatus429(outcome)) {
    return Math.min(Math.max(rateLimitedSleepMs, previousSleepMs), maxSleepMs);
  }
  return Math.min(Math.max(previousSleepMs * 2, normalSleepMs * 2), maxSleepMs);
}
