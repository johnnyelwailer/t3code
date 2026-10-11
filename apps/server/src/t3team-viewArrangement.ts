/**
 * Draft and live layout for a view surface. The key is the surface (for example
 * `project.dashboard.myWork`), the viewer, and a scope string the surface defines.
 * The plan JSON is opaque here; the surface validates it before store.
 */
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export type ViewArrangementChannel = "live" | "draft";

export type ViewArrangementIdentity = {
  readonly provider: string;
  readonly accountId: string;
};

export type ViewArrangementKey = {
  readonly identity: ViewArrangementIdentity;
  readonly surface: string;
  readonly scope: string;
  readonly channel: ViewArrangementChannel;
};

const PLAN_JSON_MAX = 200_000;

const ensureViewArrangementTable = Effect.fn("t3team.viewArrangement.ensureTable")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_view_arrangement (
      surface TEXT NOT NULL,
      provider TEXT NOT NULL,
      account_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      channel TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (surface, provider, account_id, scope, channel)
    )
  `;
});

const parsePlanJson = (planJson: string): unknown => {
  try {
    return JSON.parse(planJson) as unknown;
  } catch {
    return undefined;
  }
};

export function readViewArrangement(key: ViewArrangementKey) {
  return Effect.gen(function* () {
    yield* ensureViewArrangementTable();
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly planJson: string }>`
      SELECT plan_json AS "planJson" FROM t3team_view_arrangement
      WHERE surface = ${key.surface}
        AND provider = ${key.identity.provider}
        AND account_id = ${key.identity.accountId}
        AND scope = ${key.scope}
        AND channel = ${key.channel}
    `;
    const row = rows[0];
    if (row === undefined) return null;
    return parsePlanJson(row.planJson) ?? null;
  });
}

/** Upsert a plan the caller has already validated. */
export function storeViewArrangement(key: ViewArrangementKey, plan: unknown) {
  return Effect.gen(function* () {
    const planJson = JSON.stringify(plan);
    if (planJson.length > PLAN_JSON_MAX) {
      return yield* Effect.fail(new Error("Arrangement plan is too large."));
    }
    yield* ensureViewArrangementTable();
    const sql = yield* SqlClient.SqlClient;
    const nowMs = yield* Clock.currentTimeMillis;
    yield* sql`
      INSERT INTO t3team_view_arrangement
        (surface, provider, account_id, scope, channel, plan_json, updated_at_ms)
      VALUES (
        ${key.surface}, ${key.identity.provider}, ${key.identity.accountId}, ${key.scope},
        ${key.channel}, ${planJson}, ${nowMs}
      )
      ON CONFLICT (surface, provider, account_id, scope, channel)
      DO UPDATE SET plan_json = excluded.plan_json, updated_at_ms = excluded.updated_at_ms
    `;
    return plan;
  });
}

export function deleteViewArrangement(key: ViewArrangementKey) {
  return Effect.gen(function* () {
    yield* ensureViewArrangementTable();
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      DELETE FROM t3team_view_arrangement
      WHERE surface = ${key.surface}
        AND provider = ${key.identity.provider}
        AND account_id = ${key.identity.accountId}
        AND scope = ${key.scope}
        AND channel = ${key.channel}
    `;
  }).pipe(Effect.asVoid);
}
