/**
 * The SQLite half of the digest burndown backfill: one table of changelog
 * status transitions plus a per-sprint marker that says "already fetched,
 * stop asking Jira". The runner (backfillDigestBurndown) fills it; the digest
 * loader reads it back every round.
 */

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { T3TeamBacklogCacheIdentity } from "./t3team-atlassian-backlog-cacheShared.ts";

export const ensureDigestBurndownTables = Effect.fn("t3team.digestBurndown.ensureTables")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_digest_burndown_sprints (
      provider TEXT NOT NULL,
      account_id TEXT NOT NULL,
      external_project_id TEXT NOT NULL,
      sprint_id TEXT NOT NULL,
      backfilled_at_ms INTEGER NOT NULL,
      PRIMARY KEY (provider, account_id, external_project_id, sprint_id)
    )
  `;
    yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_digest_burndown_transitions (
      provider TEXT NOT NULL,
      account_id TEXT NOT NULL,
      external_project_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      issue_key TEXT,
      from_status TEXT,
      to_status TEXT NOT NULL,
      at_ms INTEGER NOT NULL,
      PRIMARY KEY (provider, account_id, external_project_id, issue_id, at_ms, to_status)
    )
  `;
  },
);

export type DigestBurndownBackfillRow = {
  readonly issueId: string;
  readonly issueKey: string | null;
  readonly from: string | null;
  readonly to: string;
  readonly atMs: number;
};

/** The backfilled history of one project's items; `ready` = already fetched. */
export function readDigestBurndownBackfill(identity: T3TeamBacklogCacheIdentity, sprintId: string) {
  return Effect.gen(function* () {
    yield* ensureDigestBurndownTables();
    const sql = yield* SqlClient.SqlClient;
    const marker = yield* sql<{ readonly atMs: number }[]>`
      SELECT backfilled_at_ms AS "atMs" FROM t3team_digest_burndown_sprints
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
        AND sprint_id = ${sprintId}
    `;
    const rows = yield* sql<DigestBurndownBackfillRow>`
      SELECT issue_id AS "issueId", issue_key AS "issueKey",
             from_status AS "from", to_status AS "to", at_ms AS "atMs"
      FROM t3team_digest_burndown_transitions
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
      ORDER BY issue_id ASC, at_ms ASC
    `;
    return { ready: marker.length > 0, rows };
  });
}

/**
 * The cache write of the backfill: one insert per changelog transition plus
 * the sprint marker. Idempotent — rows are INSERT OR IGNORE, the marker is
 * an upsert — so a retried backfill adds nothing.
 */
export function recordDigestBurndownBackfill(
  identity: T3TeamBacklogCacheIdentity,
  sprintId: string,
  entries: ReadonlyArray<{
    readonly issueId: string;
    readonly issueKey?: string;
    readonly from: string | null;
    readonly to: string;
    readonly atMs: number;
  }>,
) {
  return Effect.gen(function* () {
    yield* ensureDigestBurndownTables();
    const sql = yield* SqlClient.SqlClient;
    for (const entry of entries) {
      yield* sql`
      INSERT OR IGNORE INTO t3team_digest_burndown_transitions (
        provider, account_id, external_project_id,
        issue_id, issue_key, from_status, to_status, at_ms
      ) VALUES (
        ${identity.provider}, ${identity.accountId}, ${identity.externalProjectId},
        ${entry.issueId}, ${entry.issueKey ?? null},
        ${entry.from ?? null}, ${entry.to}, ${entry.atMs}
      )
    `;
    }
    yield* sql`
      INSERT INTO t3team_digest_burndown_sprints (
        provider, account_id, external_project_id, sprint_id, backfilled_at_ms
      ) VALUES (
        ${identity.provider}, ${identity.accountId}, ${identity.externalProjectId},
        ${sprintId}, ${0}
      )
      ON CONFLICT (provider, account_id, external_project_id, sprint_id)
      DO UPDATE SET backfilled_at_ms = excluded.backfilled_at_ms
    `;
  });
}
