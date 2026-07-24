import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_thread_messages
    ADD COLUMN sequence INTEGER
  `;

  yield* sql`
    UPDATE projection_thread_messages AS message
    SET sequence = (
      SELECT COUNT(*) - 1
      FROM projection_thread_messages AS earlier
      WHERE earlier.thread_id = message.thread_id
        AND earlier.rowid <= message.rowid
    )
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projection_thread_messages_thread_sequence
    ON projection_thread_messages(thread_id, sequence)
  `;
});
