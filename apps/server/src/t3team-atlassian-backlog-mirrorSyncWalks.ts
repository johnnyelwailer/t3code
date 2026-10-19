import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { pruneStaleT3TeamAtlassianBacklogViews } from "./t3team-atlassian-backlog-reconcilePrune.ts";
import {
  computeWatermarkLookbackMinutes,
  type MirrorSyncIdentity,
  type T3TeamAtlassianMirrorSyncRequest,
} from "./t3team-atlassian-backlog-mirrorSyncShared.ts";
import { deleteMirrorIssuesAbsentFromWalk } from "./t3team-atlassian-backlog-mirrorSyncDb.ts";
import { clearMirrorProgress, recordMirrorReached } from "./t3team-atlassian-mirrorSyncProgress.ts";
import {
  type MirrorPageItem,
  type MirrorPageSource,
  walkMirrorPages,
} from "./t3team-atlassian-mirrorSyncPageWalk.ts";
import {
  advanceT3TeamMirrorWatermark,
  readT3TeamMirrorSyncStatus,
  recordT3TeamMirrorCatchUp,
} from "./t3team-atlassian-mirrorSyncState.ts";

// ─── Catch-up walk (persisted watermark) ─────────────────────────────────────

/** `caught-up`: Jira has no change newer than the watermark. `more-pending`: page cap hit, resume next walk. */
export type MirrorCatchUpOutcome = "caught-up" | "more-pending" | "superseded";

function newestUpdatedAtMs(items: ReadonlyArray<MirrorPageItem>): number | undefined {
  let newest: number | undefined;
  for (const item of items) {
    const updatedAt = item["updatedAt"];
    const updatedMs = typeof updatedAt === "string" ? Date.parse(updatedAt) : Number.NaN;
    if (Number.isFinite(updatedMs) && (newest === undefined || updatedMs > newest)) {
      newest = updatedMs;
    }
  }
  return newest;
}

/**
 * Fetches every issue updated since the project's persisted watermark, oldest
 * first, and advances the watermark after each durably stored page. A gap of
 * any length is closed: a walk that hits the page cap reports `more-pending`
 * and the next walk resumes from the advanced watermark, as does one that
 * fails mid-way (crash, rate limit). Only a walk that reaches the last page
 * records a successful catch-up.
 */
export function runMirrorCatchUpWalk(
  input: T3TeamAtlassianMirrorSyncRequest,
  source: MirrorPageSource,
  identity: MirrorSyncIdentity,
  isSuperseded: () => boolean,
) {
  return Effect.gen(function* () {
    const walkStartMs = yield* Clock.currentTimeMillis;
    const { watermarkMs, lastSuccessAtMs } = yield* readT3TeamMirrorSyncStatus(identity);
    const trackProgress = lastSuccessAtMs === undefined;
    const end = yield* walkMirrorPages({
      request: input,
      source,
      identity,
      isSuperseded,
      updatedWithinMinutes: computeWatermarkLookbackMinutes({ nowMs: walkStartMs, watermarkMs }),
      walk: "catch-up",
      trackProgress,
      failureMessage: "Failed to fetch Atlassian mirror page (catch-up).",
      onPageStored: (items) => {
        const newestMs = newestUpdatedAtMs(items);
        if (newestMs === undefined) return Effect.void;
        if (trackProgress) recordMirrorReached(identity, newestMs);
        return advanceT3TeamMirrorWatermark(identity, newestMs);
      },
    });
    if (end === "superseded") return "superseded" satisfies MirrorCatchUpOutcome;
    if (end === "page-cap") return "more-pending" satisfies MirrorCatchUpOutcome;
    yield* recordT3TeamMirrorCatchUp(identity, walkStartMs);
    clearMirrorProgress(identity);
    return "caught-up" satisfies MirrorCatchUpOutcome;
  });
}

// ─── Full reconcile walk (prune only) ────────────────────────────────────────

/** `incomplete`: the walk did not see every issue (page cap or superseded), so nothing was pruned. */
export type MirrorReconcileOutcome = "complete" | "incomplete";

/**
 * Walks every issue in the project (no updated filter), collects all seen IDs,
 * then deletes rows for issues that are no longer in the project at all. It
 * exists for pruning only; freshness comes from `runMirrorCatchUpWalk`.
 *
 * Failure modes are explicit: `listProjectMirrorPage` THROWS
 * `AtlassianMirrorSourceUnavailableError` when the client or project lookup is
 * unavailable (it never silently returns an empty page for those cases), so a
 * provider failure fails the walk and the prune is skipped. Conversely, a
 * completed walk that saw zero issues means the project is genuinely empty and
 * pruning every mirrored row is correct.
 *
 * Exported for tests; production code enters through
 * `kickT3TeamAtlassianMirrorSync`.
 */
export function runMirrorReconcile(
  input: T3TeamAtlassianMirrorSyncRequest,
  source: MirrorPageSource,
  identity: MirrorSyncIdentity,
  isSuperseded: () => boolean,
) {
  return Effect.gen(function* () {
    const seenIds = new Set<string>();
    const end = yield* walkMirrorPages({
      request: input,
      source,
      identity,
      isSuperseded,
      updatedWithinMinutes: undefined,
      walk: "reconcile",
      failureMessage: "Failed to fetch Atlassian mirror page (reconcile).",
      onPageStored: (items) =>
        Effect.sync(() => {
          for (const item of items) seenIds.add(item.id);
        }),
    });

    if (end !== "complete" || isSuperseded()) {
      yield* Effect.logWarning(
        "t3team atlassian mirror reconcile did not see every issue; skipping prune to avoid deleting unseen issues",
      ).pipe(Effect.annotateLogs({ ...identity, end }));
      return "incomplete" satisfies MirrorReconcileOutcome;
    }

    yield* deleteMirrorIssuesAbsentFromWalk({ identity, seenIds }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("t3team atlassian mirror reconcile prune failed", cause),
      ),
    );

    // View rows (one per board/sprint/filter selection ever opened) are pruned
    // here too — nothing else ever deletes them.
    const nowMs = yield* Clock.currentTimeMillis;
    yield* pruneStaleT3TeamAtlassianBacklogViews({ identity, nowMs }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("t3team atlassian mirror reconcile view prune failed", cause),
      ),
    );
    return "complete" satisfies MirrorReconcileOutcome;
  });
}
