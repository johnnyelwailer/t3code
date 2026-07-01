import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "./persistence/Errors.ts";
import {
  readCachedBacklogIssueRows,
  readCachedBacklogViewRow,
  serializeBacklogCacheJson,
} from "./t3work-atlassian-backlog-cacheQueries.ts";
import {
  buildPersistedSelectionKeys,
  fingerprintBacklogPayload,
  parseJson,
  type BacklogResourceRef,
  type T3workAtlassianBacklogPayload,
  type T3workBacklogCacheIdentity,
  type T3workBacklogSelectionInput,
} from "./t3work-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";

export { readCachedT3workAtlassianBacklog } from "./t3work-atlassian-backlog-cacheRead.ts";
export { appendCachedT3workAtlassianBacklogSyncPage } from "./t3work-atlassian-backlog-cacheSyncAppend.ts";

export const writeCachedT3workAtlassianBacklog = Effect.fn("t3work.atlassianBacklogCache.write")(
  function* (
    input: T3workBacklogCacheIdentity & {
      readonly requestSelection?: T3workBacklogSelectionInput;
      readonly response: T3workAtlassianBacklogPayload;
      readonly updatedAt?: number;
      readonly replaceProjectCache?: boolean;
      readonly mergeExistingTail?: boolean;
    },
  ) {
    return yield* Effect.gen(function* () {
      yield* ensureBacklogCacheTables();
      const sql = yield* SqlClient.SqlClient;
      const updatedAt = input.updatedAt ?? (yield* Clock.currentTimeMillis);

      // A bounded live fetch only sees the first page. When the cache already
      // holds a longer list for this selection (from background sync), keep the
      // known tail so a foreground refresh cannot shrink the backlog back to
      // one page. The tail is pruned when a sync walk completes.
      let response = input.response;
      if (input.mergeExistingTail && !input.replaceProjectCache && input.response.page.nextCursor) {
        const existingRow = yield* readCachedBacklogViewRow({
          provider: input.provider,
          accountId: input.accountId,
          externalProjectId: input.externalProjectId,
          ...(input.requestSelection ? { selection: input.requestSelection } : {}),
        });
        const existingIds = existingRow
          ? parseJson<ReadonlyArray<string>>(existingRow.issueIdsJson)
          : null;
        const liveIds = new Set(input.response.page.items.map((item) => item.id));
        const tailIds = (existingIds ?? []).filter((id) => !liveIds.has(id));
        if (tailIds.length > 0) {
          const issueRows = yield* readCachedBacklogIssueRows({
            provider: input.provider,
            accountId: input.accountId,
            externalProjectId: input.externalProjectId,
          });
          const issuesById = new Map(
            issueRows.map((row) => [row.issueId, parseJson<BacklogResourceRef>(row.resourceJson)]),
          );
          const tailItems = tailIds
            .map((id) => issuesById.get(id))
            .filter((item): item is BacklogResourceRef => Boolean(item));
          response = {
            ...input.response,
            page: {
              ...input.response.page,
              items: [...input.response.page.items, ...tailItems],
            },
          };
        }
      }

      const selectionKeys = buildPersistedSelectionKeys({
        response,
        ...(input.requestSelection ? { requestSelection: input.requestSelection } : {}),
      });

      yield* sql.withTransaction(
        Effect.gen(function* () {
          if (input.replaceProjectCache) {
            yield* sql`
            DELETE FROM t3work_atlassian_backlog_views
            WHERE provider = ${input.provider}
              AND account_id = ${input.accountId}
              AND external_project_id = ${input.externalProjectId}
          `;
            yield* sql`
            DELETE FROM t3work_atlassian_backlog_issues
            WHERE provider = ${input.provider}
              AND account_id = ${input.accountId}
              AND external_project_id = ${input.externalProjectId}
          `;
          }

          for (const item of input.response.page.items) {
            const assigneeAccountId =
              (item as BacklogResourceRef).assigneeAccountId ?? null;
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
              ${input.provider},
              ${input.accountId},
              ${input.externalProjectId},
              ${item.id},
              ${item.displayId ?? null},
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
          `;
          }

          for (const selectionKey of selectionKeys) {
            yield* sql`
            INSERT INTO t3work_atlassian_backlog_views (
              provider,
              account_id,
              external_project_id,
              selection_key,
              selected_board_id,
              selected_sprint_id,
              selected_filter_id,
              issue_ids_json,
              boards_json,
              sprints_json,
              saved_filters_json,
              capabilities_json,
              page_next_cursor,
              page_total_count,
              updated_at
            )
            VALUES (
              ${input.provider},
              ${input.accountId},
              ${input.externalProjectId},
              ${selectionKey},
              ${response.selectedBoardId ?? null},
              ${response.selectedSprintId ?? null},
              ${response.selectedFilterId ?? null},
              ${serializeBacklogCacheJson(response.page.items.map((item) => item.id))},
              ${serializeBacklogCacheJson(response.boards)},
              ${serializeBacklogCacheJson(response.sprints)},
              ${serializeBacklogCacheJson(response.savedFilters)},
              ${serializeBacklogCacheJson(response.capabilities)},
              ${response.page.nextCursor ?? null},
              ${response.page.totalCount ?? null},
              ${updatedAt}
            )
            ON CONFLICT (provider, account_id, external_project_id, selection_key)
            DO UPDATE SET
              selected_board_id = excluded.selected_board_id,
              selected_sprint_id = excluded.selected_sprint_id,
              selected_filter_id = excluded.selected_filter_id,
              issue_ids_json = excluded.issue_ids_json,
              boards_json = excluded.boards_json,
              sprints_json = excluded.sprints_json,
              saved_filters_json = excluded.saved_filters_json,
              capabilities_json = excluded.capabilities_json,
              page_next_cursor = excluded.page_next_cursor,
              page_total_count = excluded.page_total_count,
              updated_at = excluded.updated_at
          `;
          }
        }),
      );

      return {
        updatedAt,
        fingerprint: fingerprintBacklogPayload(response),
        response,
      };
    }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianBacklogCache.write")));
  },
);
