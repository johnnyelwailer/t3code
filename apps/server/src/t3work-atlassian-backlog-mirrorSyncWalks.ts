import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { tryAtlassianPromise } from "./t3work-atlassian-http.ts";
import { pruneStaleT3workAtlassianBacklogViews } from "./t3work-atlassian-backlog-reconcilePrune.ts";
import {
  burstPause,
  maxPagesPerBurst,
  maxPagesPerWalk,
  mirrorPageSize,
  type MirrorSyncIdentity,
  type T3workAtlassianMirrorSyncRequest,
} from "./t3work-atlassian-backlog-mirrorSyncShared.ts";
import {
  deleteMirrorIssuesAbsentFromWalk,
  upsertMirrorIssues,
} from "./t3work-atlassian-backlog-mirrorSyncDb.ts";

// ─── Incremental walk (watermark-based) ──────────────────────────────────────

export function runMirrorIncrementalWalk(
  input: T3workAtlassianMirrorSyncRequest,
  provider: AtlassianIntegrationProvider,
  identity: MirrorSyncIdentity,
  isSuperseded: () => boolean,
  lookbackMinutes: number,
) {
  return Effect.gen(function* () {
    let cursor: string | undefined;
    let pagesThisBurst = 0;
    let pagesThisWalk = 0;

    while (pagesThisWalk < maxPagesPerWalk) {
      if (isSuperseded()) return;

      if (pagesThisBurst >= maxPagesPerBurst) {
        pagesThisBurst = 0;
        yield* Effect.sleep(burstPause);
        if (isSuperseded()) return;
      }

      const page = yield* tryAtlassianPromise(
        () =>
          provider.listProjectMirrorPage({
            account: input.account,
            externalProjectId: input.externalProjectId,
            updatedWithinMinutes: lookbackMinutes,
            ...(cursor ? { cursor } : {}),
            limit: mirrorPageSize,
          }),
        "Failed to fetch Atlassian mirror page (incremental).",
      );

      pagesThisBurst += 1;
      pagesThisWalk += 1;

      if (isSuperseded()) return;

      yield* upsertMirrorIssues({ identity, items: page.items as ReadonlyArray<Record<string, unknown> & { id: string }> });

      if (!page.nextCursor) return;
      cursor = page.nextCursor;
    }

    yield* Effect.logDebug(
      "t3work atlassian mirror incremental walk hit page cap",
    ).pipe(
      Effect.annotateLogs({
        provider: identity.provider,
        accountId: identity.accountId,
        externalProjectId: identity.externalProjectId,
        pagesThisWalk,
      }),
    );
  });
}

// ─── Full reconcile walk ──────────────────────────────────────────────────────

/**
 * Walks every issue in the project (no updated filter), collects all seen IDs,
 * then deletes rows for issues that are no longer in the project at all.
 *
 * Failure modes are explicit: `listProjectMirrorPage` THROWS
 * `AtlassianMirrorSourceUnavailableError` when the client or project lookup is
 * unavailable (it never silently returns an empty page for those cases), so a
 * provider failure aborts the walk here before `walkComplete` is set and the
 * prune is skipped. Conversely, a completed walk that saw zero issues means
 * the project is genuinely empty and pruning every mirrored row is correct.
 *
 * Exported for tests; production code enters through
 * `kickT3workAtlassianMirrorSync`.
 */
export function runMirrorReconcile(
  input: T3workAtlassianMirrorSyncRequest,
  provider: AtlassianIntegrationProvider,
  identity: MirrorSyncIdentity,
  isSuperseded: () => boolean,
) {
  return Effect.gen(function* () {
    const seenIds = new Set<string>();
    let cursor: string | undefined;
    let pagesThisBurst = 0;
    let pagesThisWalk = 0;
    let walkComplete = false;

    while (pagesThisWalk < maxPagesPerWalk) {
      if (isSuperseded()) return;

      if (pagesThisBurst >= maxPagesPerBurst) {
        pagesThisBurst = 0;
        yield* Effect.sleep(burstPause);
        if (isSuperseded()) return;
      }

      const page = yield* tryAtlassianPromise(
        () =>
          provider.listProjectMirrorPage({
            account: input.account,
            externalProjectId: input.externalProjectId,
            // No updatedSinceIso: walk the whole project
            ...(cursor ? { cursor } : {}),
            limit: mirrorPageSize,
          }),
        "Failed to fetch Atlassian mirror page (reconcile).",
      );

      pagesThisBurst += 1;
      pagesThisWalk += 1;

      for (const item of page.items) {
        seenIds.add(item.id);
      }

      if (isSuperseded()) return;

      yield* upsertMirrorIssues({ identity, items: page.items as ReadonlyArray<Record<string, unknown> & { id: string }> });

      if (!page.nextCursor) {
        walkComplete = true;
        break;
      }
      cursor = page.nextCursor;
    }

    if (isSuperseded()) return;

    // Only prune when the walk actually reached the end of the project. If it
    // stopped early (hit the page cap on a very large project), seenIds is
    // incomplete and pruning would wrongly delete issues beyond the cap.
    if (!walkComplete) {
      yield* Effect.logWarning(
        "t3work atlassian mirror reconcile hit page cap before completing; skipping prune to avoid deleting unseen issues",
      ).pipe(
        Effect.annotateLogs({
          provider: identity.provider,
          accountId: identity.accountId,
          externalProjectId: identity.externalProjectId,
          pagesThisWalk,
        }),
      );
      return;
    }

    // Prune rows for issues that no longer exist in the project at all.
    yield* deleteMirrorIssuesAbsentFromWalk({ identity, seenIds }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("t3work atlassian mirror reconcile prune failed", cause),
      ),
    );

    // Also prune view rows (one per board/sprint/filter selection ever
    // opened) that haven't been refreshed in ~30 days — nothing else ever
    // deletes them. Degrades to a warning rather than failing the walk.
    const nowMs = yield* Clock.currentTimeMillis;
    yield* pruneStaleT3workAtlassianBacklogViews({ identity, nowMs }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("t3work atlassian mirror reconcile view prune failed", cause),
      ),
    );
  });
}
