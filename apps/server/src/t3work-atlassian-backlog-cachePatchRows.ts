import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "./persistence/Errors.ts";
import { serializeBacklogCacheJson } from "./t3work-atlassian-backlog-cacheQueries.ts";
import {
  parseJson,
  type BacklogIssueRow,
  type BacklogResourceRef,
  type T3workAtlassianBacklogCapabilities,
} from "./t3work-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";

export const patchCachedIssueRows = Effect.fn("t3work.atlassianBacklogCache.patchIssues")(
  function* (input: {
    readonly provider: string;
    readonly accountId: string;
    readonly issueIdOrKey: string;
    readonly patch: (item: BacklogResourceRef) => BacklogResourceRef;
    readonly patchCapabilities?: (
      capabilities: T3workAtlassianBacklogCapabilities,
    ) => T3workAtlassianBacklogCapabilities;
  }) {
    return yield* Effect.gen(function* () {
      yield* ensureBacklogCacheTables();
      const sql = yield* SqlClient.SqlClient;
      const updatedAt = yield* Clock.currentTimeMillis;

      const matchingRows = yield* sql<BacklogIssueRow>`
      SELECT
        external_project_id AS "externalProjectId",
        issue_id AS "issueId",
        issue_key AS "issueKey",
        resource_json AS "resourceJson"
      FROM t3work_atlassian_backlog_issues
      WHERE provider = ${input.provider}
        AND account_id = ${input.accountId}
        AND (issue_id = ${input.issueIdOrKey} OR issue_key = ${input.issueIdOrKey})
    `;
      if (matchingRows.length === 0) {
        return;
      }

      const projectIds = new Set<string>();
      yield* sql.withTransaction(
        Effect.gen(function* () {
          for (const row of matchingRows) {
            const parsed = parseJson<BacklogResourceRef>(row.resourceJson);
            if (!parsed) {
              continue;
            }

            const patched = input.patch(parsed);
            projectIds.add(row.externalProjectId);
            yield* sql`
            UPDATE t3work_atlassian_backlog_issues
            SET
              issue_key = ${patched.displayId ?? row.issueKey},
              resource_json = ${serializeBacklogCacheJson(patched)},
              updated_at = ${updatedAt}
            WHERE provider = ${input.provider}
              AND account_id = ${input.accountId}
              AND external_project_id = ${row.externalProjectId}
              AND issue_id = ${row.issueId}
          `;
          }

          for (const externalProjectId of projectIds) {
            if (!input.patchCapabilities) {
              yield* sql`
              UPDATE t3work_atlassian_backlog_views
              SET updated_at = ${updatedAt}
              WHERE provider = ${input.provider}
                AND account_id = ${input.accountId}
                AND external_project_id = ${externalProjectId}
            `;
              continue;
            }

            const viewRows = yield* sql<{
              readonly selectionKey: string;
              readonly capabilitiesJson: string;
            }>`
            SELECT
              selection_key AS "selectionKey",
              capabilities_json AS "capabilitiesJson"
            FROM t3work_atlassian_backlog_views
            WHERE provider = ${input.provider}
              AND account_id = ${input.accountId}
              AND external_project_id = ${externalProjectId}
          `;

            for (const row of viewRows) {
              const parsedCapabilities = parseJson<T3workAtlassianBacklogCapabilities>(
                row.capabilitiesJson,
              );
              if (!parsedCapabilities) {
                continue;
              }

              yield* sql`
              UPDATE t3work_atlassian_backlog_views
              SET
                capabilities_json = ${serializeBacklogCacheJson(
                  input.patchCapabilities(parsedCapabilities),
                )},
                updated_at = ${updatedAt}
              WHERE provider = ${input.provider}
                AND account_id = ${input.accountId}
                AND external_project_id = ${externalProjectId}
                AND selection_key = ${row.selectionKey}
            `;
            }
          }
        }),
      );
    }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianBacklogCache.patchIssues")));
  },
);
