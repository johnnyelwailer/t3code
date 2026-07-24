import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../Layers/Sqlite.ts";
import Migration0038 from "./t3team-038_BacklogQuickFilters.ts";

const layer = it.layer(SqlitePersistenceMemory);

layer("t3team-038 BacklogQuickFilters", (it) => {
  it.effect("is a no-op when the backlog views table does not exist yet", () =>
    Effect.gen(function* () {
      yield* Migration0038;
      assert.ok(true, "migration completed without the table present");
    }),
  );

  it.effect("adds quick_filters_json to an existing table and tolerates being run twice", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
          CREATE TABLE IF NOT EXISTS t3team_atlassian_backlog_views (
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

      yield* sql`
          INSERT INTO t3team_atlassian_backlog_views (
            provider, account_id, external_project_id, selection_key,
            issue_ids_json, boards_json, sprints_json, saved_filters_json,
            capabilities_json, updated_at
          ) VALUES
            ('atlassian', 'a1', 'p1', 'board=1:sprint=default:filter=default',
             '[]', '[]', '[]', '[]', '[]', 0),
            ('atlassian', 'a1', 'p1', 'board=1:sprint=default:filter=default:quickFilters=7',
             '[]', '[]', '[]', '[]', '[]', 0),
            ('atlassian', 'a1', 'p1', 'board=2:sprint=default:filter=default',
             '["legacy"]', '[]', '[]', '[]', '[]', 0),
            ('atlassian', 'a1', 'p1', 'board=2:sprint=default:filter=default:quickFilters=default',
             '["newer"]', '[]', '[]', '[]', '[]', 0)
        `;

      yield* Migration0038;
      yield* Migration0038;

      const rows = yield* sql<{ name: string }>`
          SELECT name FROM pragma_table_info('t3team_atlassian_backlog_views')
          WHERE name = 'quick_filters_json'
        `;
      assert.strictEqual(rows.length, 1);

      const keys = yield* sql<{ selection_key: string; issue_ids_json: string }>`
          SELECT selection_key, issue_ids_json
          FROM t3team_atlassian_backlog_views ORDER BY selection_key
        `;
      assert.deepStrictEqual(
        keys.map((row) => row.selection_key),
        [
          "board=1:sprint=default:filter=default:quickFilters=7",
          "board=1:sprint=default:filter=default:quickFilters=default",
          "board=2:sprint=default:filter=default:quickFilters=default",
        ],
      );
      // On a key collision the already-new-format row wins over the legacy one.
      assert.strictEqual(keys[2]?.issue_ids_json, '["newer"]');
    }),
  );
});
