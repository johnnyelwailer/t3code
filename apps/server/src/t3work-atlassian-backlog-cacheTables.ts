import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export const ensureBacklogCacheTables = Effect.fn("t3work.atlassianBacklogCache.ensureTables")(
  function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`
      CREATE TABLE IF NOT EXISTS t3work_atlassian_backlog_issues (
        provider TEXT NOT NULL,
        account_id TEXT NOT NULL,
        external_project_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        issue_key TEXT,
        resource_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        assignee_account_id TEXT,
        PRIMARY KEY (provider, account_id, external_project_id, issue_id)
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_t3work_atlassian_backlog_issues_account_key
      ON t3work_atlassian_backlog_issues (provider, account_id, issue_key)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_t3work_atlassian_backlog_issues_my_work
      ON t3work_atlassian_backlog_issues (provider, account_id, external_project_id, assignee_account_id)
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS t3work_atlassian_backlog_views (
        provider TEXT NOT NULL,
        account_id TEXT NOT NULL,
        external_project_id TEXT NOT NULL,
        selection_key TEXT NOT NULL,
        selected_board_id TEXT,
        selected_sprint_id TEXT,
        selected_filter_id TEXT,
        issue_ids_json TEXT NOT NULL,
        boards_json TEXT NOT NULL,
        sprints_json TEXT NOT NULL,
        saved_filters_json TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        page_next_cursor TEXT,
        page_total_count INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (provider, account_id, external_project_id, selection_key)
      )
    `;
  },
);
