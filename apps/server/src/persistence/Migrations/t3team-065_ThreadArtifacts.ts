/**
 * Fork thread artifacts side store (ledger id 87): rich rows attached to a
 * thread or one of its messages (widgets, draft mutations, workflow/decision
 * cards, actor cards, work-item attachments, pack kinds) that V2 messages
 * cannot carry. Written by `t3team-v2/t3team-threadArtifactsStore.ts` and
 * streamed per thread over `t3team.subscribeThreadArtifacts`.
 */
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_thread_artifacts (
      artifact_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      message_id TEXT,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_t3team_thread_artifacts_thread
    ON t3team_thread_artifacts(thread_id, created_at, artifact_id)
  `;
});
