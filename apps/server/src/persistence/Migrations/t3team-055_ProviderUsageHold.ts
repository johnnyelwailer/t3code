/**
 * Provider usage-limit hold (GHE #421, phase 2 — the act + auto-resume layer).
 *
 * When a provider's rolling plan window is exhausted — Claude's five-hour
 * window at 0% remaining, severity `critical` against the host thresholds —
 * the provider-usage watcher (t3team-providerUsageWatcher.ts) pauses every
 * thread that would run on that provider instead of letting it burn bounded
 * re-drive retries or die overnight. This table is the durable per-thread
 * hold record:
 *
 *   • `thread_id` — the thread whose next provider turn is held.
 *   • `provider` — the DRIVER KIND whose account-level window is exhausted
 *     (`claudeAgent`, `codex`, …). Limits live at the account level, so the
 *     hold is driver-scoped, not instance-scoped; `provider_instance_id`
 *     names the instance that sampled it, when known.
 *   • `since` / `resets_at` — when the hold started and the moment the
 *     provider said the window resets. `resets_at` is the auto-resume
 *     trigger: the watcher re-checks shortly after it, and a host restart
 *     honors the same timestamp (an overdue deadline catches up immediately,
 *     mirroring the workflow scheduler's downtime semantics).
 *   • `auto_resume` — the per-thread toggle, default ON. When the window
 *     recovers, threads with `auto_resume = 1` re-drive their pending turn
 *     automatically; threads with `0` stay paused until the user resumes.
 *   • `pending_turn_message_id` — the LATEST user message whose turn start
 *     the reactor deferred while the hold was active. On release the
 *     watcher re-dispatches `thread.turn.resume` for it; earlier pending
 *     messages ride along in the full-thread transcript the provider
 *     re-sends, so only the newest needs replay (the same collapse the
 *     #403 re-drive already performs via `promptIsLatestUserMessage`).
 *
 * Released rows keep `released_at` / `release_reason` for audit and dev
 * inspection; they never gate a turn again.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE provider_usage_holds (
      thread_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_instance_id TEXT,
      since TEXT NOT NULL,
      resets_at TEXT,
      auto_resume INTEGER NOT NULL DEFAULT 1,
      pending_turn_message_id TEXT,
      released_at TEXT,
      release_reason TEXT,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX idx_provider_usage_holds_active
    ON provider_usage_holds (provider, provider_instance_id)
    WHERE released_at IS NULL
  `;
});
