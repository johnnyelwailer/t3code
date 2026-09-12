/**
 * Drops `thread_task_records` — the durable task-journal table created by
 * t3team-056 (id 69).
 *
 * The task-journal tooling was removed from the server: the plan/task feature
 * is provider-native (every provider adapter translates its own todo tool
 * into a `turn.plan.updated` runtime event; the nexplore pack ships its own
 * plan tool and translates it the same way). The separate journal table and
 * its broker tools had no remaining consumer, so the store goes.
 *
 * Ordering matters, and it is enforced by procedure, not by DDL:
 *   1. `apps/server/scripts/t3team-replay-task-records-to-plans.ts` (one-time)
 *      reads
 *      every live thread's rows from this table and re-records each list as a
 *      `turn.plan.updated` activity through the orchestration engine — the
 *      SAME command path the provider adapters use, so no events are
 *      hand-written here.
 *   2. ONLY AFTER that replay has run against a live database is it safe to
 *      start a server build containing this migration. Starting the new build
 *      first would drop unreplayed rows.
 *
 * Migration 056 stays in the registry: on a NEW database the table is
 * created (empty) and then dropped here, so a fresh install and a migrated
 * install converge on the same schema. No data is copied in SQL. The replay
 * script does not delete rows, so the table stays readable until THIS
 * migration runs — replay can be re-run as many times as needed up to that
 * point; afterwards the source is gone and the replay has nothing to read.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    DROP TABLE IF EXISTS thread_task_records
  `;
});
