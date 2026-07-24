/**
 * DB-backed durability for the t3team workflow engine (Epic 25 §Open question 2).
 *
 * Two tables make a suspended run survive a server restart:
 *   • workflow_journal — one row per journal entry (the SqliteJournalStore backing). A call/
 *     sent entry is keyed by (run_id, seq); a `resolved` reply reuses its matching `sent`
 *     entry's seq (so the spec's (run_id, seq, phase) PK stays unique — two `resolved`
 *     replies in one run never collide, which they would if every resolved row carried the
 *     wire `seq` of 0). The full wire object is stored verbatim in `entry_json`, so the SDK's
 *     reader rebuilds the exact same replay maps it builds from a `journal.jsonl` line. Run
 *     metadata (workflowPath/argsHash/createdAt) is the `phase='meta'` row at seq -1.
 *   • workflow_runs — the run record + the pending ask, the DATA needed to rebuild a resume
 *     closure on boot (the CODE — broker/tools/llm/callbacks — is reconstructed from host
 *     layers, never persisted). `status` drives boot rehydration's `listByStatus('suspended')`.
 *
 * Single-instance only — no distributed locks (Epic 25 §Out of scope).
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS workflow_journal (
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      phase TEXT NOT NULL,
      correlation_id TEXT,
      entry_json TEXT NOT NULL,
      PRIMARY KEY (run_id, seq, phase)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_workflow_journal_run
    ON workflow_journal(run_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      run_id TEXT PRIMARY KEY,
      workflow_path TEXT NOT NULL,
      args_json TEXT NOT NULL,
      args_hash TEXT NOT NULL,
      launch_thread_id TEXT,
      project_id TEXT NOT NULL,
      model_json TEXT NOT NULL,
      runtime_mode TEXT NOT NULL,
      interaction_mode TEXT NOT NULL,
      status TEXT NOT NULL,
      pending_thread_id TEXT,
      pending_correlation_id TEXT,
      pending_kind TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
    ON workflow_runs(status)
  `;
});
