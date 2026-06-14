import type { ResourcePage } from "@t3tools/project-context";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "./persistence/Errors.ts";
import { serializeBacklogCacheJson } from "./t3work-atlassian-backlog-cacheQueries.ts";
import {
  parseJson,
  type T3workBacklogCacheIdentity,
} from "./t3work-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";

export const appendCachedT3workAtlassianBacklogSyncPage = Effect.fn(
  "t3work.atlassianBacklogCache.appendSyncPage",
)(function* (
  input: T3workBacklogCacheIdentity & {
    readonly selectionKeys: ReadonlyArray<string>;
    readonly items: ResourcePage["items"];
    /** Advance (or clear) the sync cursor checkpoint. Omit to leave the
     * checkpoint untouched, e.g. when merging search hits mid-walk. */
    readonly cursor?: {
      readonly next: string | null;
      readonly totalCount?: number;
    };
    /** When a full sync walk finished, replace the view's id list with exactly
     * the ids seen during the walk so remotely removed issues get pruned. */
    readonly replaceIssueIds?: ReadonlyArray<string>;
  },
) {
  return yield* Effect.gen(function* () {
    yield* ensureBacklogCacheTables();
    const sql = yield* SqlClient.SqlClient;
    const updatedAt = yield* Clock.currentTimeMillis;

    yield* sql.withTransaction(
      Effect.gen(function* () {
        for (const item of input.items) {
          yield* sql`
            INSERT INTO t3work_atlassian_backlog_issues (
              provider,
              account_id,
              external_project_id,
              issue_id,
              issue_key,
              resource_json,
              updated_at
            )
            VALUES (
              ${input.provider},
              ${input.accountId},
              ${input.externalProjectId},
              ${item.id},
              ${item.displayId ?? null},
              ${serializeBacklogCacheJson(item)},
              ${updatedAt}
            )
            ON CONFLICT (provider, account_id, external_project_id, issue_id)
            DO UPDATE SET
              issue_key = excluded.issue_key,
              resource_json = excluded.resource_json,
              updated_at = excluded.updated_at
          `;
        }

        for (const selectionKey of input.selectionKeys) {
          const rows = yield* sql<{ issueIdsJson: string }>`
            SELECT issue_ids_json AS "issueIdsJson"
            FROM t3work_atlassian_backlog_views
            WHERE provider = ${input.provider}
              AND account_id = ${input.accountId}
              AND external_project_id = ${input.externalProjectId}
              AND selection_key = ${selectionKey}
            LIMIT 1
          `;
          const row = rows[0];
          if (!row) {
            continue;
          }

          let issueIds: ReadonlyArray<string>;
          if (input.replaceIssueIds) {
            issueIds = input.replaceIssueIds;
          } else {
            const existingIds = parseJson<ReadonlyArray<string>>(row.issueIdsJson) ?? [];
            const seen = new Set(existingIds);
            issueIds = [
              ...existingIds,
              ...input.items.map((item) => item.id).filter((id) => !seen.has(id)),
            ];
          }

          if (input.cursor) {
            yield* sql`
              UPDATE t3work_atlassian_backlog_views
              SET
                issue_ids_json = ${serializeBacklogCacheJson(issueIds)},
                page_next_cursor = ${input.cursor.next},
                page_total_count = ${input.cursor.totalCount ?? null},
                updated_at = ${updatedAt}
              WHERE provider = ${input.provider}
                AND account_id = ${input.accountId}
                AND external_project_id = ${input.externalProjectId}
                AND selection_key = ${selectionKey}
            `;
          } else {
            yield* sql`
              UPDATE t3work_atlassian_backlog_views
              SET
                issue_ids_json = ${serializeBacklogCacheJson(issueIds)},
                updated_at = ${updatedAt}
              WHERE provider = ${input.provider}
                AND account_id = ${input.accountId}
                AND external_project_id = ${input.externalProjectId}
                AND selection_key = ${selectionKey}
            `;
          }
        }
      }),
    );

    return { updatedAt };
  }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianBacklogCache.appendSyncPage")));
});
