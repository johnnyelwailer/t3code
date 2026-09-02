import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Kind-first index for cross-thread activity lookups (GHE #382).
 *
 * `POST /api/t3team/thread/placements` resolves a child's parent by scanning
 * `t3team.handoff.started` activities for a matching `childThreadId`. Without
 * an index on `kind`, every lookup was a full-table scan (86k rows ≈ 15 ms),
 * issued once per requested thread, which starved the event loop and made the
 * desktop readiness probe time out.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_kind_created
    ON projection_thread_activities(kind, created_at, activity_id)
  `;
});
