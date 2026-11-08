import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export function ensureT3TeamContextBlobColumns() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      ALTER TABLE t3team_context_artifacts ADD COLUMN blob_sha256 TEXT
    `.pipe(Effect.catch(() => Effect.void));
    // The purge candidate query and reference counts look artifacts up by blob; without this each
    // blob costs a full artifact-table scan. Created after the ALTER so older databases have the column.
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_t3team_context_artifacts_blob_sha256
      ON t3team_context_artifacts (blob_sha256)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_t3team_context_blobs_purged_at
      ON t3team_context_blobs (purged_at) WHERE purged_at IS NOT NULL
    `;
  });
}

/** A purged row's file is gone and nothing reads it; the window only absorbs a re-link racing the purge. */
export const T3TEAM_CONTEXT_BLOB_TOMBSTONE_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes at most `limit` purged blob rows older than the tombstone window that no artifact
 * references. Cache churn marked up to 118k rows a day purged and kept every one forever.
 */
export function deleteExpiredT3TeamContextBlobTombstones(input: {
  readonly now: number;
  readonly limit: number;
}) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const purgedBefore = input.now - T3TEAM_CONTEXT_BLOB_TOMBSTONE_RETENTION_MS;
    const rows = yield* sql<{ readonly deleted: number }>`
      DELETE FROM t3team_context_blobs
      WHERE sha256 IN (
        SELECT blob.sha256
        FROM t3team_context_blobs AS blob INDEXED BY idx_t3team_context_blobs_purged_at
        WHERE blob.purged_at IS NOT NULL
          AND blob.purged_at < ${purgedBefore}
          AND NOT EXISTS (
            SELECT 1 FROM t3team_context_artifacts
            WHERE t3team_context_artifacts.blob_sha256 = blob.sha256
          )
        LIMIT ${input.limit}
      )
      RETURNING 1 AS deleted
    `;
    return rows.length;
  });
}

export function upsertT3TeamContextBlob(input: {
  readonly sha256: string;
  readonly path: string;
  readonly sizeBytes: number;
}) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = yield* Clock.currentTimeMillis;
    yield* sql`
      INSERT INTO t3team_context_blobs (
        sha256, path, size_bytes, updated_at, last_accessed_at, purged_at
      ) VALUES (
        ${input.sha256}, ${input.path}, ${input.sizeBytes}, ${now}, ${now}, NULL
      )
      ON CONFLICT (sha256) DO UPDATE SET
        path = excluded.path,
        size_bytes = excluded.size_bytes,
        updated_at = excluded.updated_at,
        last_accessed_at = excluded.last_accessed_at,
        purged_at = NULL
    `;
  });
}

export function touchT3TeamContextBlob(sha256: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = yield* Clock.currentTimeMillis;
    yield* sql`
      UPDATE t3team_context_blobs
      SET last_accessed_at = ${now}, updated_at = ${now}, purged_at = NULL
      WHERE sha256 = ${sha256}
    `;
  });
}

export function upsertT3TeamContextArtifact(input: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly kind: string;
  readonly sizeBytes: number;
  readonly blobSha256: string;
}) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = yield* Clock.currentTimeMillis;
    yield* sql`
      INSERT INTO t3team_context_artifacts (
        workspace_root, relative_path, kind, size_bytes, updated_at,
        last_accessed_at, blob_sha256
      ) VALUES (
        ${input.workspaceRoot}, ${input.relativePath}, ${input.kind}, ${input.sizeBytes},
        ${now}, ${now}, ${input.blobSha256}
      )
      ON CONFLICT (workspace_root, relative_path) DO UPDATE SET
        kind = excluded.kind,
        size_bytes = excluded.size_bytes,
        updated_at = excluded.updated_at,
        last_accessed_at = excluded.last_accessed_at,
        blob_sha256 = excluded.blob_sha256
    `;
  });
}

export function countT3TeamContextBlobReferences(sha256: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly count: number }>`
      SELECT COUNT(*) AS count
      FROM t3team_context_artifacts
      WHERE blob_sha256 = ${sha256}
    `;
    return rows[0]?.count ?? 0;
  });
}

export function sumT3TeamContextBlobBytes() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly total: number | null }>`
      SELECT SUM(size_bytes) AS total
      FROM t3team_context_blobs
      WHERE purged_at IS NULL
    `;
    return rows[0]?.total ?? 0;
  });
}

export function listT3TeamContextPurgeCandidates(limit: number) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<{
      readonly sha256: string;
      readonly path: string;
      readonly size_bytes: number;
    }>`
      SELECT sha256, path, size_bytes
      FROM t3team_context_blobs
      WHERE purged_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM t3team_context_artifacts
          WHERE t3team_context_artifacts.blob_sha256 = t3team_context_blobs.sha256
        )
      ORDER BY last_accessed_at ASC
      LIMIT ${limit}
    `;
  });
}

export function markT3TeamContextBlobPurged(sha256: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = yield* Clock.currentTimeMillis;
    yield* sql`
      UPDATE t3team_context_blobs
      SET purged_at = ${now}, updated_at = ${now}
      WHERE sha256 = ${sha256}
    `;
  });
}

/**
 * Marks a blob purged only if no artifact references it, in one statement so a writer that links an
 * artifact between a separate count and mark cannot have its live blob excluded from the budget.
 * Writers upsert the artifact row before `touchT3TeamContextBlob`, so a mark that lands before the
 * row exists is cleared by that touch.
 */
export function markT3TeamContextBlobPurgedIfUnreferenced(sha256: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = yield* Clock.currentTimeMillis;
    yield* sql`
      UPDATE t3team_context_blobs
      SET purged_at = ${now}, updated_at = ${now}
      WHERE sha256 = ${sha256}
        AND NOT EXISTS (
          SELECT 1 FROM t3team_context_artifacts
          WHERE t3team_context_artifacts.blob_sha256 = ${sha256}
        )
    `;
  });
}
