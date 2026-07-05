import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "./persistence/Errors.ts";
import {
  patchCachedBacklogAssignee,
  patchCachedBacklogEstimate,
  patchEstimateCapabilities,
} from "./t3work-atlassian-backlog-cachePatches.ts";
import { patchCachedIssueRows } from "./t3work-atlassian-backlog-cachePatchRows.ts";
import { serializeBacklogCacheJson } from "./t3work-atlassian-backlog-cacheQueries.ts";
import {
  type T3workAtlassianBacklogCapabilities,
  type T3workAtlassianBacklogPayload,
} from "./t3work-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";

export const updateCachedT3workAtlassianBacklogAssignee = Effect.fn(
  "t3work.atlassianBacklogCache.updateAssignee",
)(function* (input: {
  readonly provider: string;
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly assigneeAccountId?: string | null;
  readonly assigneeDisplayName?: string | null;
}) {
  yield* patchCachedIssueRows({
    provider: input.provider,
    accountId: input.accountId,
    issueIdOrKey: input.issueIdOrKey,
    patch: patchCachedBacklogAssignee(input),
  });
});

export const updateCachedT3workAtlassianBacklogEstimate = Effect.fn(
  "t3work.atlassianBacklogCache.updateEstimate",
)(function* (input: {
  readonly provider: string;
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly estimateValue: number | null;
  readonly mode: "points" | "hours";
  readonly estimateFieldLabel?: string;
}) {
  const estimateFieldLabel =
    input.mode === "points" && input.estimateFieldLabel ? input.estimateFieldLabel : null;

  yield* patchCachedIssueRows({
    provider: input.provider,
    accountId: input.accountId,
    issueIdOrKey: input.issueIdOrKey,
    patch: patchCachedBacklogEstimate(input),
    ...(estimateFieldLabel
      ? {
          patchCapabilities: patchEstimateCapabilities(estimateFieldLabel),
        }
      : {}),
  });
});

export const incrementCachedT3workAtlassianBacklogSubtaskCount = Effect.fn(
  "t3work.atlassianBacklogCache.incrementSubtaskCount",
)(function* (input: {
  readonly provider: string;
  readonly accountId: string;
  readonly issueIdOrKey: string;
}) {
  yield* patchCachedIssueRows({
    provider: input.provider,
    accountId: input.accountId,
    issueIdOrKey: input.issueIdOrKey,
    patch: (item) => ({
      ...item,
      subtaskCount: (item.subtaskCount ?? 0) + 1,
    }),
  });
});

/**
 * Refreshes only the selection metadata columns (boards/sprints/saved
 * filters/quick filters/capabilities/selected ids) for existing view rows
 * matching the given selection keys. Never touches issue_ids_json or the
 * page cursor — this is a metadata-only self-heal for rows whose selection
 * options were persisted empty (e.g. a 429 during the original fetch), not a
 * cache write.
 */
export const updateCachedBacklogViewMetadata = Effect.fn(
  "t3work.atlassianBacklogCache.updateViewMetadata",
)(function* (input: {
  readonly provider: string;
  readonly accountId: string;
  readonly externalProjectId: string;
  readonly selectionKeys: ReadonlyArray<string>;
  readonly boards: T3workAtlassianBacklogPayload["boards"];
  readonly sprints: T3workAtlassianBacklogPayload["sprints"];
  readonly savedFilters: T3workAtlassianBacklogPayload["savedFilters"];
  readonly quickFilters: T3workAtlassianBacklogPayload["quickFilters"];
  readonly capabilities: T3workAtlassianBacklogCapabilities;
  readonly selectedBoardId?: string;
  readonly selectedSprintId?: string;
  readonly selectedFilterId?: string;
}) {
  return yield* Effect.gen(function* () {
    if (input.selectionKeys.length === 0) {
      return;
    }
    yield* ensureBacklogCacheTables();
    const sql = yield* SqlClient.SqlClient;
    const updatedAt = yield* Clock.currentTimeMillis;

    yield* sql.withTransaction(
      Effect.gen(function* () {
        for (const selectionKey of input.selectionKeys) {
          yield* sql`
            UPDATE t3work_atlassian_backlog_views
            SET
              selected_board_id = ${input.selectedBoardId ?? null},
              selected_sprint_id = ${input.selectedSprintId ?? null},
              selected_filter_id = ${input.selectedFilterId ?? null},
              boards_json = ${serializeBacklogCacheJson(input.boards)},
              sprints_json = ${serializeBacklogCacheJson(input.sprints)},
              saved_filters_json = ${serializeBacklogCacheJson(input.savedFilters)},
              quick_filters_json = ${serializeBacklogCacheJson(input.quickFilters)},
              capabilities_json = ${serializeBacklogCacheJson(input.capabilities)},
              updated_at = ${updatedAt}
            WHERE provider = ${input.provider}
              AND account_id = ${input.accountId}
              AND external_project_id = ${input.externalProjectId}
              AND selection_key = ${selectionKey}
          `;
        }
      }),
    );
  }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianBacklogCache.updateViewMetadata")));
});

export { insertCachedT3workAtlassianBacklogChildIssue } from "./t3work-atlassian-backlog-cacheChildInsert.ts";
