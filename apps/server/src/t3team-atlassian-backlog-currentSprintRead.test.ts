import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import * as TestClock from "effect/testing/TestClock";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import {
  readCachedBacklogViewRow,
  serializeBacklogCacheJson,
} from "./t3team-atlassian-backlog-cacheQueries.ts";
import { ensureBacklogCacheTables } from "./t3team-atlassian-backlog-cacheTables.ts";

// Phil's real IES rows on 2026-10-15: a September "default" row still pinned to
// 8.5, the 8.5 view, and a 9.1 view. A default read must land on 9.1.
const identity = { provider: "atlassian", accountId: "acc", externalProjectId: "10008" };
const s86 = { id: "4448", name: "PW Sprint 8.6", state: "active", boardId: "95", startDate: "2026-10-01T10:22:39.451Z", endDate: "2026-10-14T21:30:00.000Z" };
const s91 = { id: "7228", name: "PW Sprint 9.1", state: "future", boardId: "95", startDate: "2026-10-14T22:00:00.000Z", endDate: "2026-11-04T22:00:00.000Z" };
const s85 = { id: "4447", name: "PW Sprint 8.5", state: "active", boardId: "95", startDate: "2026-09-03T15:47:13.381Z", endDate: "2026-09-23T21:30:00.000Z" };

const insert = (key: string, board: string, sprint: string, updatedAt: number, sprints: unknown[]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO t3team_atlassian_backlog_views (
        provider, account_id, external_project_id, selection_key, selected_board_id,
        selected_sprint_id, issue_ids_json, boards_json, sprints_json, saved_filters_json,
        capabilities_json, updated_at
      ) VALUES (
        ${identity.provider}, ${identity.accountId}, ${identity.externalProjectId}, ${key},
        ${board}, ${sprint}, '[]', '[]', ${serializeBacklogCacheJson(sprints)}, '[]', '{}', ${updatedAt}
      )
    `;
  });

it.layer(SqlitePersistenceMemory)("default backlog read follows the shared sprint resolver", (it) => {
  it.effect("serves the 9.1 view, not the stale default/8.5 rows", () =>
    Effect.gen(function* () {
      yield* ensureBacklogCacheTables();
      yield* TestClock.setTime(Date.parse("2026-10-15T08:00:00.000Z"));
      yield* insert("board=default:sprint=default:filter=default:quickFilters=default", "95", "4447", 3, [s85, s86, s91]);
      yield* insert("board=95:sprint=4447:filter=default:quickFilters=default", "95", "4447", 4, [s85, s86, s91]);
      yield* insert("board=95:sprint=7228:filter=default:quickFilters=default", "95", "7228", 2, [s86, s91]);
      const row = yield* readCachedBacklogViewRow({ ...identity });
      assert.strictEqual(row?.selectedSprintId, "7228");
      const explicit = yield* readCachedBacklogViewRow({ ...identity, selection: { boardId: "95", sprintId: "4447" } });
      assert.strictEqual(explicit?.selectedSprintId, "4447");
    }),
  );
});
