import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ensureT3workContextBlobColumns } from "./t3work-context-blob-store-tables.ts";

export const ensureT3workContextCacheTables = Effect.fn("t3work.contextCache.ensureTables")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE IF NOT EXISTS t3work_context_resources (
        provider TEXT NOT NULL,
        account_id TEXT NOT NULL,
        external_project_id TEXT NOT NULL,
        resource_key TEXT NOT NULL,
        title TEXT NOT NULL,
        source_updated_at TEXT,
        fetched_at TEXT NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        PRIMARY KEY (provider, account_id, external_project_id, resource_key)
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS t3work_context_edges (
        provider TEXT NOT NULL,
        account_id TEXT NOT NULL,
        external_project_id TEXT NOT NULL,
        root_key TEXT NOT NULL,
        source_key TEXT NOT NULL,
        target_key TEXT NOT NULL,
        relation TEXT NOT NULL,
        depth INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (
          provider, account_id, external_project_id, root_key, source_key, target_key, relation
        )
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS t3work_context_artifacts (
        workspace_root TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        kind TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        blob_sha256 TEXT,
        PRIMARY KEY (workspace_root, relative_path)
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS t3work_context_blobs (
        sha256 TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        purged_at INTEGER
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS t3work_context_refresh_jobs (
        job_id TEXT PRIMARY KEY,
        root_key TEXT NOT NULL,
        workspace_root TEXT NOT NULL,
        status TEXT NOT NULL,
        max_depth INTEGER NOT NULL,
        current_depth INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS t3work_context_refresh_job_queue (
        job_id TEXT NOT NULL,
        resource_key TEXT NOT NULL,
        depth INTEGER NOT NULL,
        enqueued_at INTEGER NOT NULL,
        failure_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (job_id, resource_key)
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS t3work_context_refresh_job_seen (
        job_id TEXT NOT NULL,
        resource_key TEXT NOT NULL,
        PRIMARY KEY (job_id, resource_key)
      )
    `;
    yield* sql`
      CREATE VIRTUAL TABLE IF NOT EXISTS t3work_context_search
      USING fts5(provider, account_id, external_project_id, resource_key, title, body)
    `.pipe(Effect.catch(() => Effect.void));
    yield* ensureT3workContextBlobColumns();
  },
);
