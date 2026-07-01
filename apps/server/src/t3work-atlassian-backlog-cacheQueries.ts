import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  buildBacklogSelectionKey,
  type BacklogIssueRow,
  type BacklogViewRow,
  type T3workBacklogCacheIdentity,
  type T3workBacklogSelectionInput,
} from "./t3work-atlassian-backlog-cacheShared.ts";

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
