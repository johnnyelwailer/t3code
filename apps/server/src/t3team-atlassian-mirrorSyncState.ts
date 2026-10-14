/**
 * Persisted per-project state of the whole-project Jira mirror sync.
 *
 * - `watermarkMs`: the newest Jira `updatedAt` durably mirrored. Catch-up walks
 *   fetch everything updated since it, so a gap of any length is closed.
 * - `lastSuccessAtMs`: when a catch-up walk last reached the end of Jira's
 *   change list — the only honest "synced at" for the mirror.
 * - `lastReconcileAtMs`: when the prune-only full reconcile last completed, so a restarted
 *   loop keeps its ~24 h cadence instead of walking the whole project again.
 * - `lastError` / `lastErrorAtMs`: the most recent failure since that success;
 *   cleared by the next successful catch-up.
 *
 * Lives in its own table, created on first use like the backlog cache tables it
 * describes, so it survives restarts and idle loop shutdowns.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { toPersistenceSqlError } from "./persistence/Errors.ts";
import type { MirrorSyncIdentity } from "./t3team-atlassian-backlog-mirrorSyncShared.ts";

export type T3TeamMirrorSyncStatus = {
  readonly watermarkMs: number | undefined;
  readonly lastSuccessAtMs: number | undefined;
  readonly lastReconcileAtMs: number | undefined;
  readonly lastError: string | undefined;
  readonly lastErrorAtMs: number | undefined;
};

type MirrorSyncStateRow = {
  readonly watermarkMs: number | null;
  readonly lastSuccessAtMs: number | null;
  readonly lastReconcileAtMs: number | null;
  readonly lastError: string | null;
  readonly lastErrorAtMs: number | null;
};

/** SQL clients whose table already carries every column: the check runs once per database. */
const ensuredClients = new WeakSet<object>();

const ensureMirrorSyncStateTable = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  if (ensuredClients.has(sql)) return;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_atlassian_mirror_sync_state (
      provider TEXT NOT NULL,
      account_id TEXT NOT NULL,
      external_project_id TEXT NOT NULL,
      watermark_ms INTEGER,
      last_success_at INTEGER,
      last_error TEXT,
      last_error_at INTEGER,
      PRIMARY KEY (provider, account_id, external_project_id)
    )
  `;
  // Added after the table shipped: older databases gain the column on first use.
  const columns = yield* sql<{ readonly name: string }>`
    SELECT name FROM pragma_table_info('t3team_atlassian_mirror_sync_state')
  `;
  if (!columns.some((column) => column.name === "last_reconcile_at")) {
    yield* sql`ALTER TABLE t3team_atlassian_mirror_sync_state ADD COLUMN last_reconcile_at INTEGER`;
  }
  ensuredClients.add(sql);
});

const insertMissingStateRow = (identity: MirrorSyncIdentity) =>
  Effect.gen(function* () {
    yield* ensureMirrorSyncStateTable;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO t3team_atlassian_mirror_sync_state (provider, account_id, external_project_id)
      VALUES (${identity.provider}, ${identity.accountId}, ${identity.externalProjectId})
      ON CONFLICT (provider, account_id, external_project_id) DO NOTHING
    `;
    return sql;
  });

function toStatus(row: MirrorSyncStateRow | undefined): T3TeamMirrorSyncStatus {
  return {
    watermarkMs: row?.watermarkMs ?? undefined,
    lastSuccessAtMs: row?.lastSuccessAtMs ?? undefined,
    lastReconcileAtMs: row?.lastReconcileAtMs ?? undefined,
    lastError: row?.lastError ?? undefined,
    lastErrorAtMs: row?.lastErrorAtMs ?? undefined,
  };
}

/** The mirror sync state for one project; every field is `undefined` before the first walk. */
export function readT3TeamMirrorSyncStatus(identity: MirrorSyncIdentity) {
  return Effect.gen(function* () {
    yield* ensureMirrorSyncStateTable;
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<MirrorSyncStateRow>`
      SELECT
        watermark_ms AS "watermarkMs",
        last_success_at AS "lastSuccessAtMs",
        last_reconcile_at AS "lastReconcileAtMs",
        last_error AS "lastError",
        last_error_at AS "lastErrorAtMs"
      FROM t3team_atlassian_mirror_sync_state
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
    `;
    return toStatus(rows[0]);
  }).pipe(Effect.mapError(toPersistenceSqlError("t3team.atlassianMirrorSync.readState")));
}

/** The mirror sync state of every project the account has synced. */
export function readT3TeamMirrorSyncStatusesForAccount(accountId: string) {
  return Effect.gen(function* () {
    yield* ensureMirrorSyncStateTable;
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<MirrorSyncStateRow>`
      SELECT
        watermark_ms AS "watermarkMs",
        last_success_at AS "lastSuccessAtMs",
        last_reconcile_at AS "lastReconcileAtMs",
        last_error AS "lastError",
        last_error_at AS "lastErrorAtMs"
      FROM t3team_atlassian_mirror_sync_state
      WHERE account_id = ${accountId}
    `;
    return rows.map(toStatus);
  }).pipe(Effect.mapError(toPersistenceSqlError("t3team.atlassianMirrorSync.readAccountState")));
}

/** Move the watermark forward to `watermarkMs`; never moves it back. */
export function advanceT3TeamMirrorWatermark(identity: MirrorSyncIdentity, watermarkMs: number) {
  return Effect.gen(function* () {
    const sql = yield* insertMissingStateRow(identity);
    yield* sql`
      UPDATE t3team_atlassian_mirror_sync_state
      SET watermark_ms = MAX(COALESCE(watermark_ms, 0), ${watermarkMs})
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
    `;
  }).pipe(Effect.mapError(toPersistenceSqlError("t3team.atlassianMirrorSync.advanceWatermark")));
}

/** A catch-up walk reached the end of Jira's change list; it started at `walkStartMs`. */
export function recordT3TeamMirrorCatchUp(identity: MirrorSyncIdentity, walkStartMs: number) {
  return Effect.gen(function* () {
    const sql = yield* insertMissingStateRow(identity);
    yield* sql`
      UPDATE t3team_atlassian_mirror_sync_state
      SET last_success_at = ${walkStartMs}, last_error = NULL, last_error_at = NULL
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
    `;
  }).pipe(Effect.mapError(toPersistenceSqlError("t3team.atlassianMirrorSync.recordCatchUp")));
}

export function recordT3TeamMirrorSyncFailure(
  identity: MirrorSyncIdentity,
  failure: { readonly message: string; readonly atMs: number },
) {
  return Effect.gen(function* () {
    const sql = yield* insertMissingStateRow(identity);
    yield* sql`
      UPDATE t3team_atlassian_mirror_sync_state
      SET last_error = ${failure.message}, last_error_at = ${failure.atMs}
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
    `;
  }).pipe(Effect.mapError(toPersistenceSqlError("t3team.atlassianMirrorSync.recordFailure")));
}

/** The prune-only full reconcile reached the end of the project at `atMs`. */
export function recordT3TeamMirrorReconcile(identity: MirrorSyncIdentity, atMs: number) {
  return Effect.gen(function* () {
    const sql = yield* insertMissingStateRow(identity);
    yield* sql`
      UPDATE t3team_atlassian_mirror_sync_state
      SET last_reconcile_at = ${atMs}
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND external_project_id = ${identity.externalProjectId}
    `;
  }).pipe(Effect.mapError(toPersistenceSqlError("t3team.atlassianMirrorSync.recordReconcile")));
}
