/**
 * Fork hook for the V1 transcript importer: V1 fork builds stored hidden
 * framing rows (notification/kickoff framing, agent-only notes) as ordinary
 * user/assistant messages marked `t3team_ext_json.visibleToUser = false`.
 * Importing them would surface machine framing as visible user messages, so
 * the importer excludes them with this predicate.
 *
 * Databases that never ran the fork's ext-column migration (pure upstream
 * copies) have no `t3team_ext_json`; the predicate is then empty.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { Fragment } from "effect/unstable/sql/Statement";

const visibleExpression = (column: string) =>
  `CASE WHEN json_valid(${column}) THEN COALESCE(json_extract(${column}, '$.visibleToUser'), 1) ELSE 1 END <> 0`;

/**
 * Resolves, once per importer instance, an `AND …` fragment that keeps only
 * messages visible to the user. `alias` qualifies the column (`message`,
 * `earlier`) when the query aliases the V1 message table.
 */
export const makeLegacyVisibleMessageFilter = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_thread_messages)
  `.pipe(Effect.orElseSucceed(() => []));
  const hasExtColumn = columns.some((column) => column.name === "t3team_ext_json");
  return (alias?: "message" | "earlier"): Fragment =>
    hasExtColumn
      ? sql.literal(
          `AND ${visibleExpression(alias === undefined ? "t3team_ext_json" : `${alias}.t3team_ext_json`)}`,
        )
      : sql.literal("");
});
