/**
 * Resource-pressure journal (flag `NEXI_FF_RESOURCE_PRESSURE`).
 *
 * One row per memory-pressure LEVEL TRANSITION (ok → warn, warn → critical,
 * critical → ok, …), written by the resource-pressure monitor
 * (t3team-resourcePressureMonitor.ts). Transitions only — never one row per
 * sample — so the table stays tiny; the repository additionally prunes to the
 * newest rows on every insert. The history survives restarts so the user can
 * see what happened before an OOM took the app down.
 *
 * `reasons_json` is the classifier's reason list, `top_process_*` the largest
 * T3 process at transition time (who was eating memory).
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS resource_pressure_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at INTEGER NOT NULL,
      from_level TEXT NOT NULL,
      to_level TEXT NOT NULL,
      available_memory_bytes INTEGER NOT NULL,
      total_memory_bytes INTEGER NOT NULL,
      app_tree_rss_bytes INTEGER NOT NULL,
      reasons_json TEXT NOT NULL,
      top_process_name TEXT,
      top_process_rss_bytes INTEGER NOT NULL DEFAULT 0
    )
  `;
});
