/**
 * Fork inter-agent mailbox (ledger id 92): messages sent with `t3_thread_send`
 * mode "mailbox", kept until they are delivered to their recipient as one
 * coalesced digest run, plus the per-thread user-stop holds that pause
 * delivery. Written by `t3team-actorMailbox.ts`.
 *
 * Entry states: pending → claimed (digest id assigned, run being dispatched)
 * → delivered; `surfaced` = shown without a reaction (hop cap); `failed` =
 * gave up after repeated dispatch failures.
 */
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_thread_mailbox (
      message_id TEXT PRIMARY KEY,
      to_thread_id TEXT NOT NULL,
      from_thread_id TEXT NOT NULL,
      from_title TEXT NOT NULL,
      text TEXT NOT NULL,
      summary TEXT,
      urgency TEXT NOT NULL,
      hop_count INTEGER NOT NULL,
      root_thread_id TEXT NOT NULL,
      state TEXT NOT NULL,
      digest_message_id TEXT,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      delivered_at TEXT
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_t3team_thread_mailbox_recipient
    ON t3team_thread_mailbox(to_thread_id, state, created_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_t3team_thread_mailbox_digest
    ON t3team_thread_mailbox(digest_message_id)
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_thread_mailbox_holds (
      thread_id TEXT PRIMARY KEY,
      held_at TEXT NOT NULL
    )
  `;
});
