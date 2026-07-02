import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../Layers/Sqlite.ts";
import Migration0038 from "./t3work-038_BacklogQuickFilters.ts";

const layer = it.layer(SqlitePersistenceMemory);

layer("t3work-038 BacklogQuickFilters", (it) => {
  it.effect("is a no-op when the backlog views table does not exist yet", () =>
    Effect.gen(function* () {
      yield* Migration0038;
      assert.ok(true, "migration completed without the table present");
    }),
  );

  it.effect(
    "adds quick_filters_json to an existing table and tolerates being run twice",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
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

        yield* Migration0038;
        yield* Migration0038;

        const rows = yield* sql<{ name: string }>`
          SELECT name FROM pragma_table_info('t3work_atlassian_backlog_views')
          WHERE name = 'quick_filters_json'
        `;
        assert.strictEqual(rows.length, 1);
      }),
  );
});
