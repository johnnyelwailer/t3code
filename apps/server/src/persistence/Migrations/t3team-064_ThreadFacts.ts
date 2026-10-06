/**
 * Fork thread facts side store (ledger id 86): one row per thread holding the
 * fork-owned facts the V2 thread shell does not carry (workflow run status,
 * activity label, child status, environment binding, retention, resource
 * pressure, pack extensions). Written by `t3team-v2/t3team-threadFactsStore.ts`
 * and streamed to clients over `t3team.subscribeThreadFacts`.
 */
import * as SqlClient from "effect/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_thread_facts (
      thread_id TEXT PRIMARY KEY,
      facts_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
});
