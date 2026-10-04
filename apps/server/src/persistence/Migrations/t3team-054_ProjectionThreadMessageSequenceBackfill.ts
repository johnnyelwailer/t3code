/**
 * Backfill `projection_thread_messages.sequence` for rows that never received one (GHE #416).
 *
 * The streaming insert path did not set `sequence`, and the completing upsert's
 * `ON CONFLICT … DO UPDATE` never assigned it either, so every streamed assistant reply kept a NULL
 * sequence and sorted BEFORE its own prompt (`ORDER BY sequence ASC` puts NULL first). Both writes
 * are fixed in `ProjectionThreadMessages.ts`; this migration repairs the rows already stored,
 * numbering the NULL rows of each thread after its highest existing sequence in `created_at`,
 * then `rowid`, order — the order they were written.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    WITH numbered AS (
      SELECT
        m.rowid AS rid,
        (
          SELECT COALESCE(MAX(sequence), -1)
          FROM projection_thread_messages
          WHERE thread_id = m.thread_id
        ) + ROW_NUMBER() OVER (
          PARTITION BY m.thread_id
          ORDER BY m.created_at ASC, m.rowid ASC
        ) AS next_sequence
      FROM projection_thread_messages AS m
      WHERE m.sequence IS NULL
    )
    UPDATE projection_thread_messages
    SET sequence = (SELECT next_sequence FROM numbered WHERE numbered.rid = projection_thread_messages.rowid)
    WHERE sequence IS NULL
  `;
});
