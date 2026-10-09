import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import OrchestrationV2 from "./Migrations/055_OrchestrationV2.ts";
import RemoveRedundantProjectionIndexes from "./Migrations/056_RemoveRedundantProjectionIndexes.ts";

// Fork main briefly (b811217104..d8c2ff41d3, 2026-10-03..05) registered its sprint migrations
// ProjectionProjectsMainRepository/FeatureFlags at 84/85, the ids the V2 sync then took for
// OrchestrationV2/RemoveRedundantProjectionIndexes. V2 seeds statev2.sqlite from that ledger, so
// the Migrator skips 84/85 and 91 fails on the missing orchestration_v2_* tables. Run the two V2
// bodies and relabel 84/85 to them; 100/101 then re-run the sprint bodies, which are idempotent.
// Renumbering V2 instead would re-run its non-idempotent DDL on every install that recorded it at 84.
export const reconcileForkSprintLedger = Effect.fn("reconcileForkSprintLedger")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const tables = yield* sql`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
      `;
      if (tables.length === 0) return [];
      const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
        SELECT migration_id, name FROM effect_sql_migrations WHERE migration_id IN (84, 85)
      `;
      const sprintLedger =
        history.length === 2 &&
        history.some(
          (row) => row.migration_id === 84 && row.name === "ProjectionProjectsMainRepository",
        ) &&
        history.some((row) => row.migration_id === 85 && row.name === "FeatureFlags");
      if (!sprintLedger) return [];
      // A database that already holds the V2 schema (e.g. repaired by hand) only needs the
      // relabel; 055's DDL is not idempotent.
      const v2Tables = yield* sql`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orchestration_v2_events'
      `;
      if (v2Tables.length === 0) {
        yield* Effect.all([OrchestrationV2, RemoveRedundantProjectionIndexes], {
          discard: true,
        }).pipe(
          Effect.catchTags({
            SchemaError: (cause) =>
              new Migrator.MigrationError({
                kind: "Failed",
                message: `Repairing the fork sprint ledger (84/85) failed: ${cause.message}`,
              }),
          }),
        );
      }
      yield* sql`UPDATE effect_sql_migrations SET name = 'OrchestrationV2' WHERE migration_id = 84`;
      yield* sql`UPDATE effect_sql_migrations SET name = 'RemoveRedundantProjectionIndexes' WHERE migration_id = 85`;
      return [
        [84, "OrchestrationV2"],
        [85, "RemoveRedundantProjectionIndexes"],
      ] as const satisfies ReadonlyArray<readonly [number, string]>;
    }),
  );
});
