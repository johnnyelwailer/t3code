// @effect-diagnostics preferSchemaOverJson:off - provider snapshots are unknown JSON blobs.
import type { ResourceSnapshot } from "@t3tools/project-context";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ensureT3workContextBlobColumns } from "./t3work-context-blob-store-tables.ts";
import { normalizeTicketKey } from "./t3work-toolBrokerContextSyncScope.ts";

export type T3workContextCacheIdentity = {
  readonly provider: string;
  readonly accountId: string;
  readonly externalProjectId: string;
};

export type T3workContextEdgeRecord = {
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly relation: string;
  readonly depth: number;
};

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

export function upsertT3workContextResource(input: {
  readonly identity: T3workContextCacheIdentity;
  readonly snapshot: ResourceSnapshot;
}) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const resourceKey = normalizeTicketKey(input.snapshot.ref.displayId ?? input.snapshot.ref.id);
    const now = yield* Clock.currentTimeMillis;
    const snapshotJson = JSON.stringify(input.snapshot);
    yield* sql`
      INSERT INTO t3work_context_resources (
        provider, account_id, external_project_id, resource_key, title, source_updated_at,
        fetched_at, last_accessed_at, snapshot_json
      ) VALUES (
        ${input.identity.provider}, ${input.identity.accountId}, ${input.identity.externalProjectId},
        ${resourceKey}, ${input.snapshot.ref.title}, ${input.snapshot.ref.updatedAt ?? null},
        ${input.snapshot.fetchedAt}, ${now}, ${snapshotJson}
      )
      ON CONFLICT (provider, account_id, external_project_id, resource_key)
      DO UPDATE SET
        title = excluded.title,
        source_updated_at = excluded.source_updated_at,
        fetched_at = excluded.fetched_at,
        last_accessed_at = excluded.last_accessed_at,
        snapshot_json = excluded.snapshot_json
    `;
    yield* sql`
      DELETE FROM t3work_context_search
      WHERE provider = ${input.identity.provider}
        AND account_id = ${input.identity.accountId}
        AND external_project_id = ${input.identity.externalProjectId}
        AND resource_key = ${resourceKey}
    `.pipe(Effect.catch(() => Effect.void));
    yield* sql`
      INSERT INTO t3work_context_search (
        provider, account_id, external_project_id, resource_key, title, body
      ) VALUES (
        ${input.identity.provider}, ${input.identity.accountId}, ${input.identity.externalProjectId},
        ${resourceKey}, ${input.snapshot.ref.title}, ${input.snapshot.text ?? input.snapshot.summary ?? ""}
      )
    `.pipe(Effect.catch(() => Effect.void));
  });
}

export function upsertT3workContextEdges(input: {
  readonly identity: T3workContextCacheIdentity;
  readonly rootKey: string;
  readonly edges: ReadonlyArray<T3workContextEdgeRecord>;
}) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = yield* Clock.currentTimeMillis;
    for (const edge of input.edges) {
      yield* sql`
        INSERT INTO t3work_context_edges (
          provider, account_id, external_project_id, root_key, source_key, target_key,
          relation, depth, updated_at
        ) VALUES (
          ${input.identity.provider}, ${input.identity.accountId}, ${input.identity.externalProjectId},
          ${input.rootKey}, ${edge.sourceKey}, ${edge.targetKey}, ${edge.relation}, ${edge.depth}, ${now}
        )
        ON CONFLICT (
          provider, account_id, external_project_id, root_key, source_key, target_key, relation
        )
        DO UPDATE SET depth = excluded.depth, updated_at = excluded.updated_at
      `;
    }
  });
}
