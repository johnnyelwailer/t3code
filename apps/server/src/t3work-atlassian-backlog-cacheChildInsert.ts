import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "./persistence/Errors.ts";
import { serializeBacklogCacheJson } from "./t3work-atlassian-backlog-cacheQueries.ts";
import {
  parseJson,
  type BacklogIssueRow,
  type BacklogResourceRef,
} from "./t3work-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";

/**
 * Insert a freshly created child issue (e.g. a subtask) into the cache next to
 * its parent: upsert the issue row and append its id to every cached view of
 * the parent's project that already contains the parent. This makes the child
 * visible immediately, before Jira's search index includes it in sync pages.
 */
export const insertCachedT3workAtlassianBacklogChildIssue = Effect.fn(
  "t3work.atlassianBacklogCache.insertChildIssue",
)(function* (input: {
  readonly provider: string;
  readonly accountId: string;
  readonly parentIssueIdOrKey: string;
  readonly item: BacklogResourceRef;
}) {
  return yield* Effect.gen(function* () {
    yield* ensureBacklogCacheTables();
    const sql = yield* SqlClient.SqlClient;
    const updatedAt = yield* Clock.currentTimeMillis;

    const parentRows = yield* sql<BacklogIssueRow>`
      SELECT
        external_project_id AS "externalProjectId",
        issue_id AS "issueId",
        issue_key AS "issueKey",
        resource_json AS "resourceJson"
      FROM t3work_atlassian_backlog_issues
      WHERE provider = ${input.provider}
        AND account_id = ${input.accountId}
        AND (issue_id = ${input.parentIssueIdOrKey} OR issue_key = ${input.parentIssueIdOrKey})
    `;
    if (parentRows.length === 0) {
      return;
    }

    yield* sql.withTransaction(
      Effect.gen(function* () {
        const projectIds = new Set(parentRows.map((row) => row.externalProjectId));
        for (const externalProjectId of projectIds) {
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
              ${externalProjectId},
              ${input.item.id},
              ${input.item.displayId ?? null},
              ${serializeBacklogCacheJson(input.item)},
              ${updatedAt}
            )
            ON CONFLICT (provider, account_id, external_project_id, issue_id)
            DO UPDATE SET
              issue_key = excluded.issue_key,
              resource_json = excluded.resource_json,
              updated_at = excluded.updated_at
          `;

          const parentIds = new Set(
            parentRows
              .filter((row) => row.externalProjectId === externalProjectId)
              .map((row) => row.issueId),
          );
          const viewRows = yield* sql<{
            readonly selectionKey: string;
            readonly issueIdsJson: string;
          }>`
            SELECT
              selection_key AS "selectionKey",
              issue_ids_json AS "issueIdsJson"
            FROM t3work_atlassian_backlog_views
            WHERE provider = ${input.provider}
              AND account_id = ${input.accountId}
              AND external_project_id = ${externalProjectId}
          `;
          for (const view of viewRows) {
            const issueIds = parseJson<ReadonlyArray<string>>(view.issueIdsJson);
            if (
              !issueIds ||
              issueIds.includes(input.item.id) ||
              !issueIds.some((id) => parentIds.has(id))
            ) {
              continue;
            }

            yield* sql`
              UPDATE t3work_atlassian_backlog_views
              SET
                issue_ids_json = ${serializeBacklogCacheJson([...issueIds, input.item.id])},
                updated_at = ${updatedAt}
              WHERE provider = ${input.provider}
                AND account_id = ${input.accountId}
                AND external_project_id = ${externalProjectId}
                AND selection_key = ${view.selectionKey}
            `;
          }
        }
      }),
    );
  }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianBacklogCache.insertChildIssue")));
});
