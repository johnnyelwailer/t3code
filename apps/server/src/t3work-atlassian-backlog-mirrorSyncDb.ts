import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "./persistence/Errors.ts";
import { serializeBacklogCacheJson } from "./t3work-atlassian-backlog-cacheQueries.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";
import type { MirrorSyncIdentity } from "./t3work-atlassian-backlog-mirrorSyncShared.ts";

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Upserts mirror-walked issues into the shared backlog issues table.
 *
 * The mirror walk calls `toBacklogItem` without sprint context, so
 * `resource_json` for a mirror item always has the item's sprint resolved to
 * the *active* sprint (via `selectJiraPrimarySprint`) rather than whatever
 * sprint the selection-scoped backlog sync requested. If the update ran
 * unconditionally on every incremental/reconcile pass (~90 s), it would
 * clobber selection-enriched rows (sprintId chosen for a specific requested
 * sprint) with the mirror's active-sprint view on every tick, even when the
 * underlying issue hadn't changed in Jira at all.
 *
 * To prevent that, the `DO UPDATE` only fires when the incoming item's Jira
 * `updatedAt` is strictly newer than the stored row's `updatedAt` (both read
 * from `resource_json`, since that's where `toBacklogItem` stamps it). ISO
 * timestamps compare correctly as strings. A NULL/missing stored `updatedAt`
 * is treated as always-stale (COALESCE to the empty string, which compares
 * less than any real ISO string) so rows written before this field existed
 * still get repaired by the next walk.
 *
 * Exported for tests (precedent: `runMirrorReconcile` is exported the same
 * way).
 */
export function upsertMirrorIssues(input: {
  identity: MirrorSyncIdentity;
  items: ReadonlyArray<Record<string, unknown> & { readonly id: string }>;
}) {
  return Effect.gen(function* () {
    yield* ensureBacklogCacheTables();
    const sql = yield* SqlClient.SqlClient;
    const updatedAt = yield* Clock.currentTimeMillis;

    yield* sql.withTransaction(
      Effect.gen(function* () {
        for (const item of input.items) {
          const assigneeAccountId =
            typeof item["assigneeAccountId"] === "string" ? item["assigneeAccountId"] : null;
          const issueKey = typeof item["displayId"] === "string" ? item["displayId"] : null;
          yield* sql`
            INSERT INTO t3work_atlassian_backlog_issues (
              provider,
              account_id,
              external_project_id,
              issue_id,
              issue_key,
              resource_json,
              updated_at,
              assignee_account_id
            )
            VALUES (
              ${input.identity.provider},
              ${input.identity.accountId},
              ${input.identity.externalProjectId},
              ${item.id},
              ${issueKey},
              ${serializeBacklogCacheJson(item)},
              ${updatedAt},
              ${assigneeAccountId}
            )
            ON CONFLICT (provider, account_id, external_project_id, issue_id)
            DO UPDATE SET
              issue_key = excluded.issue_key,
              resource_json = excluded.resource_json,
              updated_at = excluded.updated_at,
              assignee_account_id = excluded.assignee_account_id
            WHERE json_extract(excluded.resource_json, '$.updatedAt') >
              COALESCE(
                json_extract(t3work_atlassian_backlog_issues.resource_json, '$.updatedAt'),
                ''
              )
          `;
        }
      }),
    );
  }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianMirrorSync.upsertIssues")));
}

export function deleteMirrorIssuesAbsentFromWalk(input: {
  identity: MirrorSyncIdentity;
  seenIds: Set<string>;
}) {
  return Effect.gen(function* () {
    // An empty seenIds set is trusted: the caller only invokes this after a
    // complete walk, and the provider throws (rather than returning an empty
    // page) when the client/project is unavailable — so empty means the
    // project genuinely has no issues and every mirrored row is stale.
    const sql = yield* SqlClient.SqlClient;

    // Fetch all stored IDs for the project, delete those not in seenIds.
    const storedRows = yield* sql<{ issueId: string }>`
      SELECT issue_id AS "issueId"
      FROM t3work_atlassian_backlog_issues
      WHERE provider = ${input.identity.provider}
        AND account_id = ${input.identity.accountId}
        AND external_project_id = ${input.identity.externalProjectId}
    `;

    const toDelete = storedRows.map((r) => r.issueId).filter((id) => !input.seenIds.has(id));

    if (toDelete.length === 0) return;

    yield* Effect.logDebug("t3work atlassian mirror reconcile pruning stale issues").pipe(
      Effect.annotateLogs({
        provider: input.identity.provider,
        accountId: input.identity.accountId,
        externalProjectId: input.identity.externalProjectId,
        pruneCount: toDelete.length,
      }),
    );

    // Delete one row at a time inside a single transaction.
    // Pruning is infrequent (~24 h) so individual deletes are acceptable.
    yield* sql.withTransaction(
      Effect.gen(function* () {
        for (const issueId of toDelete) {
          yield* sql`
            DELETE FROM t3work_atlassian_backlog_issues
            WHERE provider = ${input.identity.provider}
              AND account_id = ${input.identity.accountId}
              AND external_project_id = ${input.identity.externalProjectId}
              AND issue_id = ${issueId}
          `;
        }
      }),
    );
  }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianMirrorSync.pruneIssues")));
}
