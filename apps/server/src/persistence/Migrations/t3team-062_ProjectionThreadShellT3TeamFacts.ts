import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Two t3team facts on the thread shell, so list rows never read the thread's
 * activity log or messages (which opened a per-row detail stream, 2026-09-29):
 *
 * - `open_child_wait_count`: registered `t3team.child_wait` waits on this thread
 *   without a matching `resolved` (same open-set as `hasOpenChildWaits`).
 * - `local_session_instance_id`: the `<instanceId>` segment of the earliest
 *   `local:<instanceId>:` message id the native-session sync writes (validated
 *   against t3team-localProviderKinds when the shell is read).
 *
 * Both are backfilled here; the projector keeps them current afterwards.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE projection_threads ADD COLUMN open_child_wait_count INTEGER NOT NULL DEFAULT 0
  `;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN local_session_instance_id TEXT NULL`;
  yield* sql`
    UPDATE projection_threads
    SET open_child_wait_count = (
      SELECT COUNT(DISTINCT json_extract(r.payload_json, '$.waitId'))
      FROM projection_thread_activities AS r
      WHERE r.thread_id = projection_threads.thread_id
        AND r.kind = 't3team.child_wait.registered'
        AND json_extract(r.payload_json, '$.waitId') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM projection_thread_activities AS res
          WHERE res.thread_id = r.thread_id
            AND res.kind = 't3team.child_wait.resolved'
            AND json_extract(res.payload_json, '$.waitId') = json_extract(r.payload_json, '$.waitId')
        )
    )
    WHERE thread_id IN (
      SELECT thread_id FROM projection_thread_activities
      WHERE kind = 't3team.child_wait.registered'
    )
  `;
  yield* sql`
    UPDATE projection_threads
    SET local_session_instance_id = (
      SELECT substr(m.message_id, 7, instr(substr(m.message_id, 7), ':') - 1)
      FROM projection_thread_messages AS m
      WHERE m.thread_id = projection_threads.thread_id AND m.message_id LIKE 'local:%:%'
      ORDER BY m.created_at ASC, m.message_id ASC
      LIMIT 1
    )
    WHERE thread_id IN (
      SELECT thread_id FROM projection_thread_messages WHERE message_id LIKE 'local:%:%'
    )
  `;
});
