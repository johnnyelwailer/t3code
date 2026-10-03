/** Missing-framework seam: the distribution's PostgreSQL SqlClient and Admin adapter can
 * share this store. No connection credentials, second database runtime or UI is created here. */
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import {
  FEATURE_FLAG_DEFINITIONS,
  replaceFeatureFlagDatabaseValues,
  type FeatureFlagKey,
} from "@t3tools/project-context/t3teamFeatureFlags";
import FeatureFlagsSchema from "./persistence/Migrations/t3team-063_FeatureFlags.ts";

class UnknownFeatureFlag extends Data.TaggedError("UnknownFeatureFlag")<{ readonly key: string }> {}

export const registeredFeatureFlags = Object.entries(FEATURE_FLAG_DEFINITIONS).map(
  ([key, definition]) => ({ key: key as FeatureFlagKey, ...definition }),
);

/** Call during startup before importing project-state modules, and after any external Admin
 * update. PostgreSQL and SQLite clients use the same parameterized SQL contract. */
export const refreshFeatureFlags = Effect.fn("refreshFeatureFlags")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly key: string; readonly enabled: boolean | number }>`
    SELECT key, enabled FROM feature_flags
  `;
  const values = new Map<FeatureFlagKey, boolean>();
  for (const row of rows) {
    if (Object.hasOwn(FEATURE_FLAG_DEFINITIONS, row.key)) {
      values.set(row.key as FeatureFlagKey, row.enabled === true || row.enabled === 1);
    }
  }
  replaceFeatureFlagDatabaseValues(values);
});

export const initializeFeatureFlags = Effect.fn("initializeFeatureFlags")(function* () {
  yield* FeatureFlagsSchema;
  yield* refreshFeatureFlags();
});

/** Admin transport must authorize the caller, then call this and publish updated ServerConfig.
 * NEXI_STATE_DIR is persisted now, but PROJECT_STATE_DIR stays fixed until the next start. */
export const setFeatureFlag = Effect.fn("setFeatureFlag")(function* (
  key: FeatureFlagKey,
  enabled: boolean,
) {
  if (!Object.hasOwn(FEATURE_FLAG_DEFINITIONS, key)) {
    return yield* Effect.fail(new UnknownFeatureFlag({ key }));
  }
  const sql = yield* SqlClient.SqlClient;
  const updatedAt = DateTime.formatIso(yield* DateTime.now);
  yield* sql`INSERT INTO feature_flags (key, enabled, updated_at)
    VALUES (${key}, CASE WHEN ${enabled ? 1 : 0} = 1 THEN TRUE ELSE FALSE END, ${updatedAt})
    ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`;
  yield* refreshFeatureFlags();
});
