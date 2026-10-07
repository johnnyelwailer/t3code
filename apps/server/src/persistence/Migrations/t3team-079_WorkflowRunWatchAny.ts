import * as SqlClient from "effect/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Any-wait parks (ledger id 105): a run parked on `waitForAny` watches several
 * (instance, signal, key) tuples under ONE `signal.waitAny` correlation. `watch_any_json` holds
 * that branch list in branch order, so the delivery port and the park drain can match an event
 * against every branch and reply with the winning index. NULL for a single-signal park (the
 * `watch_*` columns alone describe it) and for every run not parked on a signal; the `watch_*`
 * columns of an any-wait still carry branch 0, so status readers keep seeing a signal park.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE workflow_runs ADD COLUMN watch_any_json TEXT NULL`;
});
