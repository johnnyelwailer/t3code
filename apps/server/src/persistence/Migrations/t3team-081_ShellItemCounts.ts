import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * The shell snapshot reads every thread's item count. Counting turn items per read walked every
 * item of every thread (about two thirds of the query's work) on each call, and the snapshot runs
 * on startup, on storage cleanup and on every client shell load: on a large install one call
 * held the event loop for seconds.
 *
 * `orchestration_v2_projection_thread_item_counts` keeps one row per (thread, run), with
 * `run_key = ''` for items outside a run. Triggers keep it exact on every insert, delete and
 * re-parenting update of a turn item, including the bulk delete of a projection rebuild.
 *
 * The partial index serves `latest_user_authored_message_at`, which otherwise opened every user
 * message's payload to find the newest one a person (not an agent) wrote.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS orchestration_v2_projection_thread_item_counts (
      thread_id TEXT NOT NULL,
      run_key TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      PRIMARY KEY (thread_id, run_key)
    ) WITHOUT ROWID
  `;
  yield* sql`DELETE FROM orchestration_v2_projection_thread_item_counts`;
  yield* sql`
    INSERT INTO orchestration_v2_projection_thread_item_counts (thread_id, run_key, item_count)
    SELECT thread_id, COALESCE(run_id, ''), COUNT(*)
    FROM orchestration_v2_projection_turn_items
    GROUP BY thread_id, COALESCE(run_id, '')
  `;

  yield* sql`
    CREATE TRIGGER IF NOT EXISTS orchestration_v2_projection_turn_items_count_insert
    AFTER INSERT ON orchestration_v2_projection_turn_items
    BEGIN
      INSERT INTO orchestration_v2_projection_thread_item_counts (thread_id, run_key, item_count)
      VALUES (NEW.thread_id, COALESCE(NEW.run_id, ''), 1)
      ON CONFLICT (thread_id, run_key) DO UPDATE SET item_count = item_count + 1;
    END
  `;
  yield* sql`
    CREATE TRIGGER IF NOT EXISTS orchestration_v2_projection_turn_items_count_delete
    AFTER DELETE ON orchestration_v2_projection_turn_items
    BEGIN
      UPDATE orchestration_v2_projection_thread_item_counts SET item_count = item_count - 1
      WHERE thread_id = OLD.thread_id AND run_key = COALESCE(OLD.run_id, '');
      DELETE FROM orchestration_v2_projection_thread_item_counts
      WHERE thread_id = OLD.thread_id AND run_key = COALESCE(OLD.run_id, '') AND item_count <= 0;
    END
  `;
  yield* sql`
    CREATE TRIGGER IF NOT EXISTS orchestration_v2_projection_turn_items_count_move
    AFTER UPDATE OF thread_id, run_id ON orchestration_v2_projection_turn_items
    WHEN OLD.thread_id IS NOT NEW.thread_id OR OLD.run_id IS NOT NEW.run_id
    BEGIN
      UPDATE orchestration_v2_projection_thread_item_counts SET item_count = item_count - 1
      WHERE thread_id = OLD.thread_id AND run_key = COALESCE(OLD.run_id, '');
      DELETE FROM orchestration_v2_projection_thread_item_counts
      WHERE thread_id = OLD.thread_id AND run_key = COALESCE(OLD.run_id, '') AND item_count <= 0;
      INSERT INTO orchestration_v2_projection_thread_item_counts (thread_id, run_key, item_count)
      VALUES (NEW.thread_id, COALESCE(NEW.run_id, ''), 1)
      ON CONFLICT (thread_id, run_key) DO UPDATE SET item_count = item_count + 1;
    END
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_messages_latest_user_authored_idx
    ON orchestration_v2_projection_messages(thread_id, updated_at DESC, message_id DESC)
    WHERE role = 'user' AND json_extract(payload_json, '$.createdBy') = 'user'
  `;
});
