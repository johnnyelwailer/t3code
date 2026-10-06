/**
 * The My Work digest's arrangement, server-side: the latest layout an agent chose for a viewer and
 * scope (`T3TeamMyWorkDigestPlan`, validated on write). No arrangement means the client's heuristic
 * default. Keyed exactly like the visit receipt (t3team-myworkDigestLastVisit): the viewer's
 * account (`digestLastVisitIdentity`) plus the digest scope, here with the app project spelled out
 * because an agent arranges ONE project's digest differently from another's.
 *
 * Read by the digest routes and the `t3team.mywork.*` broker tools; written only through
 * `storeDigestArrangement`, so every path validates the same way.
 */

import { T3TeamMyWorkDigestPlan } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { T3TeamBacklogCacheIdentity } from "./t3team-atlassian-backlog-cacheShared.ts";
import { validateDigestPlan } from "./t3team-myworkDigestArrangementValidate.ts";
import { digestLastVisitIdentity } from "./t3team-myworkDigestLastVisit.ts";
import type {
  T3TeamMyWorkDigestInput,
  T3TeamMyWorkDigestPayload,
} from "./t3team-myworkDigestTypes.ts";

const ensureDigestArrangementTable = Effect.fn("t3team.digestArrangement.ensureTable")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE IF NOT EXISTS t3team_digest_arrangement (
        provider TEXT NOT NULL,
        account_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        producer TEXT NOT NULL,
        produced_at TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (provider, account_id, scope)
      )
    `;
  },
);

/**
 * `"all"` or `"project:<appProjectId>"`. A project-scoped request without an app project has no
 * stable key, so it has no arrangement (the heuristic default stands).
 */
export function digestArrangementScope(input: T3TeamMyWorkDigestInput): string | undefined {
  if (input.scope === "all") return "all";
  const appProjectId = input.projects[0]?.appProjectId?.trim();
  return appProjectId ? `project:${appProjectId}` : undefined;
}

const PlanJson = Schema.fromJsonString(T3TeamMyWorkDigestPlan);
const decodeStoredPlan = Schema.decodeUnknownOption(PlanJson);
const encodePlan = Schema.encodeSync(PlanJson);

/** The stored arrangement for this viewer + scope; null when none (or an unreadable row). */
export function readDigestArrangement(identity: T3TeamBacklogCacheIdentity, scope: string) {
  return Effect.gen(function* () {
    yield* ensureDigestArrangementTable();
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly planJson: string }>`
      SELECT plan_json AS "planJson" FROM t3team_digest_arrangement
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND scope = ${scope}
    `;
    const row = rows[0];
    // A row that no longer decodes (schema moved on) reads as "no arrangement": the default stands.
    return row === undefined ? null : Option.getOrNull(decodeStoredPlan(row.planJson));
  });
}

/** Validate and store `plan` (upsert): the latest arrangement per viewer + scope wins. */
export function storeDigestArrangement(
  identity: T3TeamBacklogCacheIdentity,
  scope: string,
  plan: unknown,
) {
  return Effect.gen(function* () {
    const valid = yield* validateDigestPlan(plan);
    yield* ensureDigestArrangementTable();
    const sql = yield* SqlClient.SqlClient;
    const nowMs = yield* Clock.currentTimeMillis;
    yield* sql`
      INSERT INTO t3team_digest_arrangement
        (provider, account_id, scope, plan_json, producer, produced_at, updated_at_ms)
      VALUES (
        ${identity.provider}, ${identity.accountId}, ${scope}, ${encodePlan(valid)},
        ${valid.producer}, ${valid.producedAt}, ${nowMs}
      )
      ON CONFLICT (provider, account_id, scope)
      DO UPDATE SET
        plan_json = excluded.plan_json,
        producer = excluded.producer,
        produced_at = excluded.produced_at,
        updated_at_ms = excluded.updated_at_ms
    `;
    return valid;
  });
}

/** Back to the heuristic default for this viewer + scope. Clearing nothing is fine. */
export function clearDigestArrangement(identity: T3TeamBacklogCacheIdentity, scope: string) {
  return Effect.gen(function* () {
    yield* ensureDigestArrangementTable();
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      DELETE FROM t3team_digest_arrangement
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND scope = ${scope}
    `;
  }).pipe(Effect.asVoid);
}

/** Who and which scope an arrangement belongs to; undefined when the request cannot be keyed. */
export function digestArrangementKey(input: T3TeamMyWorkDigestInput) {
  const identity = digestLastVisitIdentity(input);
  const scope = digestArrangementScope(input);
  return identity === undefined || scope === undefined ? undefined : { identity, scope };
}

/** Stamp the stored arrangement into the payload (read-only); the payload is untouched when none. */
export function attachDigestArrangement(
  input: T3TeamMyWorkDigestInput,
  payload: T3TeamMyWorkDigestPayload,
) {
  return Effect.gen(function* () {
    const key = digestArrangementKey(input);
    if (key === undefined) return payload;
    const arrangement = yield* readDigestArrangement(key.identity, key.scope);
    return arrangement === null ? payload : { ...payload, arrangement };
  });
}
