/** User values for registered feature flags (the `feature_flags` table). The distribution's
 * PostgreSQL SqlClient and the local SQLite host share this store. */
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as SqlClient from "effect/sql/SqlClient";
import { FeatureFlagSetError } from "@t3tools/contracts";
import {
  findFeatureFlag,
  replaceFeatureFlagDatabaseValues,
} from "@t3tools/project-context/t3teamFeatureFlags";
import FeatureFlagsSchema from "./persistence/Migrations/t3team-065_FeatureFlags.ts";

/** Rows for keys no current registration knows are kept in the table (a pack may come back)
 * and in the snapshot; resolution only ever asks for registered keys. */
const refreshFeatureFlags = Effect.fn("refreshFeatureFlags")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly key: string; readonly enabled: boolean | number }>`
    SELECT key, enabled FROM feature_flags
  `;
  replaceFeatureFlagDatabaseValues(
    new Map(rows.map((row) => [row.key, row.enabled === true || row.enabled === 1])),
  );
});

/** Server start (before flag-gated services read startup-only flags) and after any external
 * Admin update. PostgreSQL and SQLite clients use the same parameterized SQL contract. */
export const initializeFeatureFlags = Effect.fn("initializeFeatureFlags")(function* () {
  yield* FeatureFlagsSchema;
  yield* refreshFeatureFlags();
});

/** Store (`true`/`false`) or remove (`null`) the user value. Unregistered keys and flags the
 * release owns (`userToggleable: false`) are rejected. */
export const setFeatureFlag = Effect.fn("setFeatureFlag")(function* (
  key: string,
  enabled: boolean | null,
) {
  const flag = findFeatureFlag(key);
  if (flag === undefined) {
    return yield* new FeatureFlagSetError({ key, category: "unknown" });
  }
  if (flag.userToggleable === false) {
    return yield* new FeatureFlagSetError({ key, category: "locked" });
  }
  const sql = yield* SqlClient.SqlClient;
  const write =
    enabled === null
      ? sql`DELETE FROM feature_flags WHERE key = ${key}`
      : Effect.flatMap(DateTime.now, (now) => {
          const updatedAt = DateTime.formatIso(now);
          return sql`INSERT INTO feature_flags (key, enabled, updated_at)
            VALUES (${key}, CASE WHEN ${enabled ? 1 : 0} = 1 THEN TRUE ELSE FALSE END, ${updatedAt})
            ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`;
        });
  yield* Effect.andThen(write, refreshFeatureFlags()).pipe(
    Effect.mapError((cause) => new FeatureFlagSetError({ key, category: "persistence", cause })),
  );
});
