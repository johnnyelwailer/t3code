/**
 * Fork thread silence watches (ledger id 98): one open watch per (watcher,
 * target) pair, registered through `t3team_children op:"watch"` and closed
 * (deleted) once the target stops or the watch is cancelled. `notify_count`
 * and `last_notified_at` keep the re-notify cadence and the deterministic
 * notice ids across restarts. Written by `t3team-threadSilenceWatchStore.ts`.
 *
 * Watches registered on V1 (persisted as watcher-thread activities) are not
 * carried over: they are short-lived coordination aids an agent re-arms.
 */
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_thread_silence_watches (
      watch_id TEXT PRIMARY KEY,
      watcher_thread_id TEXT NOT NULL,
      target_thread_id TEXT NOT NULL,
      target_title TEXT NOT NULL,
      timeout_ms INTEGER NOT NULL,
      notify_count INTEGER NOT NULL DEFAULT 0,
      last_notified_at INTEGER,
      created_at TEXT NOT NULL,
      UNIQUE (watcher_thread_id, target_thread_id)
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_t3team_thread_silence_watches_target
    ON t3team_thread_silence_watches(target_thread_id)
  `;
});
