/**
 * Post-reconcile pruning of stale `t3work_atlassian_backlog_views` rows.
 * (Issue pruning after a completed walk lives in
 * `t3work-atlassian-backlog-mirrorSyncDb.ts` — `deleteMirrorIssuesAbsentFromWalk`.)
 *
 * `t3work_atlassian_backlog_views` gets one row per selection key
 * (board/sprint/filter combination) a project's backlog view has ever been
 * opened with (see `t3work-atlassian-backlog-cacheReadWrite.ts` /
 * `cacheSyncAppend.ts`), each carrying a full `issue_ids_json` snapshot.
 * Nothing ever pruned this table, so a project revisited with many distinct
 * board/sprint/filter combinations over time accumulates rows forever.
 *
 * Kept in its own prefixed module so the mirror sync's 24 h reconcile pass
 * (`t3work-atlassian-backlog-mirrorSyncWalks.ts`) can call a single small
 * function.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "./persistence/Errors.ts";

type MirrorSyncIdentity = {
  readonly provider: string;
  readonly accountId: string;
  readonly externalProjectId: string;
};

/** Rows whose `updated_at` is older than this are pruned on each reconcile pass. */
export const T3WORK_BACKLOG_VIEW_STALE_MS = 30 * 24 * 60 * 60 * 1000;

export interface PruneStaleBacklogViewsInput {
  readonly identity: MirrorSyncIdentity;
  readonly nowMs: number;
  readonly staleMs?: number;
}

/**
 * Deletes `t3work_atlassian_backlog_views` rows for one (provider, account,
 * project) triple whose `updated_at` predates `nowMs - staleMs`. Scoped to a
 * single project (mirroring `deleteMirrorIssuesAbsentFromWalk`) so a
 * reconcile pass for one project never touches another project's views.
 */
export function pruneStaleT3workAtlassianBacklogViews(input: PruneStaleBacklogViewsInput) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const staleMs = input.staleMs ?? T3WORK_BACKLOG_VIEW_STALE_MS;
    const cutoffMs = input.nowMs - staleMs;

    const deletedRows = yield* sql<{ selectionKey: string }>`
      DELETE FROM t3work_atlassian_backlog_views
      WHERE provider = ${input.identity.provider}
        AND account_id = ${input.identity.accountId}
        AND external_project_id = ${input.identity.externalProjectId}
        AND updated_at < ${cutoffMs}
      RETURNING selection_key AS "selectionKey"
    `;

    if (deletedRows.length > 0) {
      yield* Effect.logDebug("t3work atlassian backlog view prune removed stale rows").pipe(
        Effect.annotateLogs({
          provider: input.identity.provider,
          accountId: input.identity.accountId,
          externalProjectId: input.identity.externalProjectId,
          prunedCount: deletedRows.length,
        }),
      );
    }

    return deletedRows.length;
  }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianBacklogCache.pruneStaleViews")));
}
