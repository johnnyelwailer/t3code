import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Re-run of the kind-first index on `projection_thread_activities` (GHE #382 repair).
 *
 * The index was originally created by migration 60 (`ProjectionThreadActivitiesKindIndex`).
 * On machines whose migration ledger had id 60 consumed by a different migration, the
 * Effect migrator (which tracks applied migrations by id) marked 60 "done" forever and
 * the index was silently never created — so the batched thread-placement lookup
 * (POST /api/t3team/thread/placements) kept running as an unindexed full-table scan and
 * froze the event loop. Re-running the same idempotent DDL from a fresh tail id repairs
 * those ledgers; `IF NOT EXISTS` makes this a no-op on databases that already ran 60
 * for the right migration.
 *
 * The startup index guard (`t3team-requiredIndexGuard.ts`) asserts the index exists
 * after migrations run, so this class of silent no-op cannot ship again.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_kind_created
    ON projection_thread_activities(kind, created_at, activity_id)
  `;
});
