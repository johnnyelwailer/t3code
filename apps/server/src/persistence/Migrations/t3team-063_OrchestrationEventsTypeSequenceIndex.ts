import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Type-first index on the event log for `OrchestrationEventStore.readMatching`.
 *
 * Startup rehydrates read a few event types out of the whole log; without this
 * index each of them is a full scan of `orchestration_events` (704k rows /
 * ~2 GB on a real install). Asserted at boot by `t3team-requiredIndexGuard.ts`.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orch_events_type_sequence
    ON orchestration_events(event_type, sequence)
  `;
});
