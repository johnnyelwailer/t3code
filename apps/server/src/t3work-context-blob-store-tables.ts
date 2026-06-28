import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export function ensureT3workContextBlobColumns() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      ALTER TABLE t3work_context_artifacts ADD COLUMN blob_sha256 TEXT
    `.pipe(Effect.catchCause(() => Effect.void));
  });
}

export function upsertT3workContextBlob(input: {
  readonly sha256: string;
  readonly path: string;
  readonly sizeBytes: number;
}) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = yield* Clock.currentTimeMillis;
    yield* sql`
      INSERT INTO t3work_context_blobs (
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

export function touchT3workContextBlob(sha256: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = yield* Clock.currentTimeMillis;
    yield* sql`
      UPDATE t3work_context_blobs
      SET last_accessed_at = ${now}, updated_at = ${now}, purged_at = NULL
      WHERE sha256 = ${sha256}
    `;
  });
}

export function upsertT3workContextArtifact(input: {
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
      INSERT INTO t3work_context_artifacts (
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

export function countT3workContextBlobReferences(sha256: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly count: number }>`
      SELECT COUNT(*) AS count
      FROM t3work_context_artifacts
      WHERE blob_sha256 = ${sha256}
    `;
    return rows[0]?.count ?? 0;
  });
}

export function sumT3workContextBlobBytes() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly total: number | null }>`
      SELECT SUM(size_bytes) AS total
      FROM t3work_context_blobs
      WHERE purged_at IS NULL
    `;
    return rows[0]?.total ?? 0;
  });
}

export function listT3workContextPurgeCandidates(limit: number) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<{
      readonly sha256: string;
      readonly path: string;
      readonly size_bytes: number;
    }>`
      SELECT sha256, path, size_bytes
      FROM t3work_context_blobs
      WHERE purged_at IS NULL
      ORDER BY last_accessed_at ASC
      LIMIT ${limit}
    `;
  });
}

export function markT3workContextBlobPurged(sha256: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = yield* Clock.currentTimeMillis;
    yield* sql`
      UPDATE t3work_context_blobs
      SET purged_at = ${now}, updated_at = ${now}
      WHERE sha256 = ${sha256}
    `;
  });
}
