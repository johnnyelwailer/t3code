/**
 * Fork V2 cutover ledger and lineage index (ledger id 91).
 *
 * - `t3team_v2_cutover` records one-shot fork cutover steps (step name →
 *   applied time + summary), so a pass that re-links V1 relations onto V2
 *   lineage runs once per database (`orchestration-v2/legacy/t3team-legacyLineageCutover.ts`).
 * - The expression index serves every "children of a thread" read over V2
 *   lineage (settle guards, the child-settle sweep, the stop cascade); it uses
 *   the exact expression those queries filter on, or SQLite would not use it.
 */
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_v2_cutover (
      step TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      summary_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_t3team_v2_threads_lineage_parent
    ON orchestration_v2_projection_threads (json_extract(payload_json, '$.lineage.parentThreadId'))
  `;
});
