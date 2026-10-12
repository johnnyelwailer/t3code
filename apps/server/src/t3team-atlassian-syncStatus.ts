/**
 * The seam between the Jira connection surfaces (Settings card, digest notice) and whatever tracks
 * mirror sync health. Both surfaces read through these two functions only, so the mirror-sync
 * module can own the real status (watermark, last failure) without any caller changing.
 *
 * `lastError` is a plain-language sentence a user can read as is; absent means the last sync
 * attempt did not fail.
 */
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export type T3TeamJiraSyncStatus = {
  /** Epoch ms of the last sync that matched Jira; absent before the first one. */
  readonly lastSyncAt?: number;
  readonly lastError?: string;
};

function statusFromSyncedAt(at: number | null | undefined): T3TeamJiraSyncStatus {
  return typeof at === "number" ? { lastSyncAt: at } : {};
}

/** Newest backlog view sync across every project of the account. */
export function readJiraSyncStatusForAccount(accountId: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly at: number | null }>`
      SELECT MAX(updated_at) AS "at"
      FROM t3team_atlassian_backlog_views
      WHERE account_id = ${accountId}
    `;
    return statusFromSyncedAt(rows[0]?.at);
  }).pipe(Effect.orElseSucceed((): T3TeamJiraSyncStatus => ({})));
}

/** One project's mirror sync health. */
export function readJiraSyncStatusForProject(input: {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
}) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly at: number | null }>`
      SELECT MAX(updated_at) AS "at"
      FROM t3team_atlassian_backlog_views
      WHERE provider = ${input.account.provider}
        AND account_id = ${input.account.id}
        AND external_project_id = ${input.externalProjectId}
    `;
    return statusFromSyncedAt(rows[0]?.at);
  }).pipe(Effect.orElseSucceed((): T3TeamJiraSyncStatus => ({})));
}
