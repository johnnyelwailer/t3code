/**
 * Status-transition history for the My Work Digest ("what moved since you
 * were last here").
 *
 * Source of truth: the whole-project mirror upsert. Jira issues only change
 * status through Jira, and the mirror already re-walks every issue, so a
 * transition is observed the moment the next mirror sync lands — the same
 * freshness the digest's ticket list has. No extra Jira calls, no status
 * webhook. Rows are bounded: 30-day retention, pruned at write time.
 */

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { T3TeamBacklogCacheIdentity } from "./t3team-atlassian-backlog-cacheShared.ts";

export const DIGEST_TRANSITION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type DigestTransitionCaptureEntry = {
  readonly issueId: string;
  readonly issueKey: string | null;
  readonly status: string;
};

export const ensureDigestTransitionTable = Effect.fn("t3team.digestStatusTransitions.ensureTable")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_atlassian_status_transitions (
      provider TEXT NOT NULL,
      account_id TEXT NOT NULL,
      external_project_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      issue_key TEXT,
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      at_ms INTEGER NOT NULL,
      PRIMARY KEY (provider, account_id, external_project_id, issue_id, at_ms)
    )
  `;
    yield* sql`
    CREATE INDEX IF NOT EXISTS idx_t3team_digest_transitions_at
    ON t3team_atlassian_status_transitions (provider, account_id, external_project_id, at_ms)
  `;
  },
);

/**
 * Record every (issueId → new status) that differs from what the mirror held
 * before. Reads the previous statuses in one indexed IN-list query, then
 * writes only the deltas — a full re-sync with no status changes inserts
 * nothing. A first sight of an issue records nothing: we never saw its
 * previous status, and pretending "To Do" → "Done" would be wrong.
 */
export const captureDigestStatusTransitions = Effect.fn("t3team.digestStatusTransitions.capture")(
  function* (
    identity: T3TeamBacklogCacheIdentity,
    next: ReadonlyArray<DigestTransitionCaptureEntry>,
  ) {
    if (next.length === 0) return;
    yield* ensureDigestTransitionTable();
    const sql = yield* SqlClient.SqlClient;
    const atMs = yield* Clock.currentTimeMillis;

    const previous = yield* sql<{ readonly issueId: string; readonly status: string | null }>`
    SELECT issue_id AS "issueId", json_extract(resource_json, '$.status') AS "status"
    FROM t3team_atlassian_backlog_issues
    WHERE provider = ${identity.provider}
      AND account_id = ${identity.accountId}
      AND external_project_id = ${identity.externalProjectId}
      AND ${sql.in(
        "issue_id",
        next.map((entry) => entry.issueId),
      )}
  `;
    const previousByIssueId = new Map(previous.map((row) => [row.issueId, row.status]));

    const writes = next.filter((entry) => {
      const from = previousByIssueId.get(entry.issueId);
      return from !== undefined && from !== null && from !== entry.status;
    });
    if (writes.length === 0) return;

    for (const entry of writes) {
      yield* sql`
      INSERT OR IGNORE INTO t3team_atlassian_status_transitions (
        provider, account_id, external_project_id, issue_id, issue_key,
        from_status, to_status, at_ms
      )
      VALUES (
        ${identity.provider}, ${identity.accountId}, ${identity.externalProjectId},
        ${entry.issueId}, ${entry.issueKey}, ${previousByIssueId.get(entry.issueId) ?? ""},
        ${entry.status}, ${atMs}
      )
    `;
    }
    // Keep the table bounded: drop this project's older rows in the same
    // write moment. Transition volume is low (status changes), so one
    // project-scoped delete per status-change batch is cheap.
    yield* sql`
    DELETE FROM t3team_atlassian_status_transitions
    WHERE provider = ${identity.provider}
      AND account_id = ${identity.accountId}
      AND external_project_id = ${identity.externalProjectId}
      AND at_ms < ${atMs - DIGEST_TRANSITION_RETENTION_MS}
  `;
  },
);

export type DigestTransitionRead = {
  readonly issueId: string;
  readonly issueKey: string | null;
  readonly from: string;
  readonly to: string;
  readonly atMs: number;
};

/** All of one project's transitions since `sinceMs` (inclusive), oldest first. */
export const readDigestStatusTransitionsSince = Effect.fn(
  "t3team.digestStatusTransitions.readSince",
)(function* (input: T3TeamBacklogCacheIdentity & { readonly sinceMs: number }) {
  yield* ensureDigestTransitionTable();
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<DigestTransitionRead>`
    SELECT issue_id AS "issueId", issue_key AS "issueKey",
           from_status AS "from", to_status AS "to", at_ms AS "atMs"
    FROM t3team_atlassian_status_transitions
    WHERE provider = ${input.provider}
      AND account_id = ${input.accountId}
      AND external_project_id = ${input.externalProjectId}
      AND at_ms >= ${input.sinceMs}
    ORDER BY at_ms ASC, issue_id ASC
  `;
  return rows;
});
