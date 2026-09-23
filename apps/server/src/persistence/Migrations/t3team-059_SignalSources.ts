/**
 * Author-defined signal sources: durable event triggers for workflows (GHE #332, design 42).
 *
 * Workflows can now park on DURABLE EVENTS from change requests and work items:
 *   • `workflow_runs` — the `watching` view of a parked run (like `sleeping` for timers):
 *     `watch_signal_name` / `watch_signal_key` name the awaited `(signal, key)` so the
 *     delivery port can join parked runs to a source event without scanning inboxes.
 *   • `workflow_signal_registrations` — the journaled binding FACT per run × source instance
 *     (upserted by the `signal.register` broker verb). The reconciler derives the desired
 *     live source set from these rows joined to non-terminal runs, deduped by instance
 *     identity `(source_name, params_hash)`.
 *   • `workflow_signal_inbox` — durable delivery slots. A source event that lands while no
 *     run is parked on it is written here (delivered=0); a later `signal.wait` drain takes
 *     the matching open entry (first-wins) and resumes without a live source.
 *   • `workflow_signal_cursors` — the durable per-instance cursor a push-only source
 *     remembers (design 42 §6): `start()` re-runs after every restart, and only a cursor
 *     bridges the host-down window.
 *
 * `status = 'watching'` itself lives in the status enum (free TEXT column, no DB
 * constraint) — see `WorkflowRunStatus` in the run repository.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // ── workflow_runs: the watching view ───────────────────────────────────────
  yield* sql`ALTER TABLE workflow_runs ADD COLUMN watch_source_name TEXT`;
  yield* sql`ALTER TABLE workflow_runs ADD COLUMN watch_params_hash TEXT`;
  yield* sql`ALTER TABLE workflow_runs ADD COLUMN watch_signal_name TEXT`;
  yield* sql`ALTER TABLE workflow_runs ADD COLUMN watch_signal_key TEXT`;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_watching
    ON workflow_runs(watch_source_name, watch_params_hash, watch_signal_name, watch_signal_key)
    WHERE status = 'watching'
  `;

  // ── signal registrations (the desired live set, per instance identity) ─────
  yield* sql`
    CREATE TABLE IF NOT EXISTS workflow_signal_registrations (
      run_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      params_hash TEXT NOT NULL,
      params_json TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      PRIMARY KEY (run_id, source_name, params_hash)
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_signal_registrations_instance
    ON workflow_signal_registrations(source_name, params_hash)
  `;

  // ── durable inbox slots (events that land while no run is parked) ──────────
  yield* sql`
    CREATE TABLE IF NOT EXISTS workflow_signal_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_name TEXT NOT NULL,
      params_hash TEXT NOT NULL,
      signal_name TEXT NOT NULL,
      key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      delivered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      delivered_at TEXT NULL
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_signal_inbox_open
    ON workflow_signal_inbox(source_name, params_hash, signal_name, key)
    WHERE delivered = 0
  `;

  // ── durable per-instance cursors (catch-up after a host-down window) ───────
  yield* sql`
    CREATE TABLE IF NOT EXISTS workflow_signal_cursors (
      instance_key TEXT PRIMARY KEY,
      cursor_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
});
