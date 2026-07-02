import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  buildBacklogSelectionKey,
  parseJson,
  type BacklogIssueRow,
  type BacklogResourceRef,
  type BacklogViewRow,
  type T3workBacklogCacheIdentity,
  type T3workBacklogSelectionInput,
} from "./t3work-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";

const hasExplicitSelection = (selection?: T3workBacklogSelectionInput): boolean =>
  Boolean(selection?.boardId || selection?.sprintId || selection?.filterId);

export const serializeBacklogCacheJson = (value: unknown): string => JSON.stringify(value);

export const readCachedBacklogViewRow = Effect.fn("t3work.atlassianBacklogCache.readViewRow")(
  function* (
    input: T3workBacklogCacheIdentity & {
      readonly selection?: T3workBacklogSelectionInput;
    },
  ) {
    const sql = yield* SqlClient.SqlClient;
    const selectionKey = buildBacklogSelectionKey(input.selection);

    const rows = yield* sql<BacklogViewRow>`
      SELECT
        selected_board_id AS "selectedBoardId",
        selected_sprint_id AS "selectedSprintId",
        selected_filter_id AS "selectedFilterId",
        issue_ids_json AS "issueIdsJson",
        boards_json AS "boardsJson",
        sprints_json AS "sprintsJson",
        saved_filters_json AS "savedFiltersJson",
        capabilities_json AS "capabilitiesJson",
        page_next_cursor AS "pageNextCursor",
        page_total_count AS "pageTotalCount",
        updated_at AS "updatedAt"
      FROM t3work_atlassian_backlog_views
      WHERE provider = ${input.provider}
        AND account_id = ${input.accountId}
        AND external_project_id = ${input.externalProjectId}
        AND selection_key = ${selectionKey}
      LIMIT 1
    `;
    const row = rows[0];
    if (row || hasExplicitSelection(input.selection)) {
      return row ?? null;
    }

    const fallbackRows = yield* sql<BacklogViewRow>`
      SELECT
        selected_board_id AS "selectedBoardId",
        selected_sprint_id AS "selectedSprintId",
        selected_filter_id AS "selectedFilterId",
        issue_ids_json AS "issueIdsJson",
        boards_json AS "boardsJson",
        sprints_json AS "sprintsJson",
        saved_filters_json AS "savedFiltersJson",
        capabilities_json AS "capabilitiesJson",
        page_next_cursor AS "pageNextCursor",
        page_total_count AS "pageTotalCount",
        updated_at AS "updatedAt"
      FROM t3work_atlassian_backlog_views
      WHERE provider = ${input.provider}
        AND account_id = ${input.accountId}
        AND external_project_id = ${input.externalProjectId}
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    return fallbackRows[0] ?? null;
  },
);

/**
 * Cheap existence check: does the mirror have ANY rows for this project at
 * all? Used to distinguish "mirror not populated yet" (fall back to the live
 * path) from "mirror populated but viewer has zero assigned issues" (the
 * empty projection result is a legitimate answer — no fallback).
 */
export const hasMirrorRowsForProject = Effect.fn(
  "t3work.atlassianBacklogCache.hasMirrorRowsForProject",
)(function* (input: T3workBacklogCacheIdentity) {
  yield* ensureBacklogCacheTables();
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly one: number }>`
    SELECT 1 AS "one"
    FROM t3work_atlassian_backlog_issues
    WHERE provider = ${input.provider}
      AND account_id = ${input.accountId}
      AND external_project_id = ${input.externalProjectId}
    LIMIT 1
  `;
  return rows.length > 0;
});

export const readCachedBacklogIssueRows = Effect.fn("t3work.atlassianBacklogCache.readIssueRows")(
  function* (input: T3workBacklogCacheIdentity) {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<BacklogIssueRow>`
      SELECT
        external_project_id AS "externalProjectId",
        issue_id AS "issueId",
        issue_key AS "issueKey",
        resource_json AS "resourceJson",
        assignee_account_id AS "assigneeAccountId"
      FROM t3work_atlassian_backlog_issues
      WHERE provider = ${input.provider}
        AND account_id = ${input.accountId}
        AND external_project_id = ${input.externalProjectId}
    `;
  },
);

/**
 * My Work projection: issues assigned to the viewer in this project, plus one
 * level of parents for the assigned issues that aren't already assigned to
 * the viewer (mirrors the parent-backfill semantics of
 * `AtlassianIntegrationProvider.listResources`). Uses the
 * `idx_t3work_atlassian_backlog_issues_my_work` index.
 */
export const readMyWorkIssueRows = Effect.fn("t3work.atlassianBacklogCache.readMyWorkIssueRows")(
  function* (
    input: T3workBacklogCacheIdentity & {
      readonly viewerAccountId: string;
    },
  ) {
    const sql = yield* SqlClient.SqlClient;

    const assignedRows = yield* sql<BacklogIssueRow>`
      SELECT
        external_project_id AS "externalProjectId",
        issue_id AS "issueId",
        issue_key AS "issueKey",
        resource_json AS "resourceJson",
        assignee_account_id AS "assigneeAccountId"
      FROM t3work_atlassian_backlog_issues
      WHERE provider = ${input.provider}
        AND account_id = ${input.accountId}
        AND external_project_id = ${input.externalProjectId}
        AND assignee_account_id = ${input.viewerAccountId}
      ORDER BY json_extract(resource_json, '$.updatedAt') DESC, issue_id ASC
    `;

    const assignedRefs: BacklogResourceRef[] = [];
    const assignedIds = new Set<string>();
    const parentIds = new Set<string>();
    for (const row of assignedRows) {
      const parsed = parseJson<BacklogResourceRef>(row.resourceJson);
      if (!parsed) continue;
      assignedRefs.push(parsed);
      assignedIds.add(row.issueId);
      if (parsed.parentId) {
        parentIds.add(parsed.parentId);
      }
    }

    // Second pass: only fetch parents that aren't already in the assigned set.
    const missingParentIds = [...parentIds].filter((id) => !assignedIds.has(id));
    if (missingParentIds.length === 0) {
      return { assigned: assignedRefs, parents: [] as BacklogResourceRef[] };
    }

    const parentRows = yield* sql<BacklogIssueRow>`
      SELECT
        external_project_id AS "externalProjectId",
        issue_id AS "issueId",
        issue_key AS "issueKey",
        resource_json AS "resourceJson",
        assignee_account_id AS "assigneeAccountId"
      FROM t3work_atlassian_backlog_issues
      WHERE provider = ${input.provider}
        AND account_id = ${input.accountId}
        AND external_project_id = ${input.externalProjectId}
        AND ${sql.in("issue_id", missingParentIds)}
      ORDER BY json_extract(resource_json, '$.updatedAt') DESC, issue_id ASC
    `;

    const parents: BacklogResourceRef[] = [];
    for (const row of parentRows) {
      const parsed = parseJson<BacklogResourceRef>(row.resourceJson);
      if (parsed) parents.push(parsed);
    }

    return { assigned: assignedRefs, parents };
  },
);
