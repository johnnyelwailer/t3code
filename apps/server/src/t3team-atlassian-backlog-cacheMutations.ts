import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "./persistence/Errors.ts";
import {
  patchCachedBacklogAssignee,
  patchCachedBacklogEstimate,
  patchEstimateCapabilities,
} from "./t3team-atlassian-backlog-cachePatches.ts";
import { patchCachedIssueRows } from "./t3team-atlassian-backlog-cachePatchRows.ts";
import { serializeBacklogCacheJson } from "./t3team-atlassian-backlog-cacheQueries.ts";
import {
  type T3TeamAtlassianBacklogCapabilities,
  type T3TeamAtlassianBacklogPayload,
} from "./t3team-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3team-atlassian-backlog-cacheTables.ts";

export const updateCachedT3TeamAtlassianBacklogAssignee = Effect.fn(
  "t3team.atlassianBacklogCache.updateAssignee",
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

export const updateCachedT3TeamAtlassianBacklogEstimate = Effect.fn(
  "t3team.atlassianBacklogCache.updateEstimate",
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

export const incrementCachedT3TeamAtlassianBacklogSubtaskCount = Effect.fn(
  "t3team.atlassianBacklogCache.incrementSubtaskCount",
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
  "t3team.atlassianBacklogCache.updateViewMetadata",
)(function* (input: {
  readonly provider: string;
  readonly accountId: string;
  readonly externalProjectId: string;
  readonly selectionKeys: ReadonlyArray<string>;
  readonly boards: T3TeamAtlassianBacklogPayload["boards"];
  readonly sprints: T3TeamAtlassianBacklogPayload["sprints"];
  readonly savedFilters: T3TeamAtlassianBacklogPayload["savedFilters"];
  readonly quickFilters: T3TeamAtlassianBacklogPayload["quickFilters"];
  readonly capabilities: T3TeamAtlassianBacklogCapabilities;
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
            UPDATE t3team_atlassian_backlog_views
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
  }).pipe(
    Effect.mapError(toPersistenceSqlError("t3team.atlassianBacklogCache.updateViewMetadata")),
  );
});

export { insertCachedT3TeamAtlassianBacklogChildIssue } from "./t3team-atlassian-backlog-cacheChildInsert.ts";
