import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ensureT3workContextCacheTables } from "./t3work-context-cache-tables.ts";
import type { T3workContextBackgroundQueueItem } from "./t3work-contextRefreshBackgroundQueue.ts";

export type T3workContextRefreshJobStatus = "pending" | "running" | "completed";

export type T3workContextRefreshJobRecord = {
  readonly jobId: string;
  readonly rootKey: string;
  readonly workspaceRoot: string;
  readonly status: T3workContextRefreshJobStatus;
  readonly maxDepth: number;
  readonly currentDepth: number;
  readonly createdAt: number;
  readonly updatedAt: number;
};

function readJobRow(row: Record<string, unknown>): T3workContextRefreshJobRecord {
  return {
    jobId: String(row.job_id),
    rootKey: String(row.root_key),
    workspaceRoot: String(row.workspace_root),
    status: String(row.status) as T3workContextRefreshJobStatus,
    maxDepth: Number(row.max_depth),
    currentDepth: Number(row.current_depth),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function upsertT3workContextRefreshJob(input: {
  readonly jobId: string;
  readonly rootKey: string;
  readonly workspaceRoot: string;
  readonly status: T3workContextRefreshJobStatus;
  readonly maxDepth: number;
  readonly currentDepth: number;
}) {
  return Effect.gen(function* () {
    yield* ensureT3workContextCacheTables();
    const sql = yield* SqlClient.SqlClient;
    const now = yield* Clock.currentTimeMillis;
    yield* sql`
      INSERT INTO t3work_context_refresh_jobs (
        job_id, root_key, workspace_root, status, max_depth, current_depth, created_at, updated_at
      ) VALUES (
        ${input.jobId}, ${input.rootKey}, ${input.workspaceRoot}, ${input.status},
        ${input.maxDepth}, ${input.currentDepth}, ${now}, ${now}
      )
      ON CONFLICT (job_id) DO UPDATE SET
        status = excluded.status,
        current_depth = excluded.current_depth,
        updated_at = excluded.updated_at
    `;
  });
}

export function listIncompleteT3workContextRefreshJobs() {
  return Effect.gen(function* () {
    yield* ensureT3workContextCacheTables();
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ job_id: string }>`
      SELECT job_id FROM t3work_context_refresh_jobs
      WHERE status IN ('pending', 'running')
    `;
    const jobs: T3workContextRefreshJobRecord[] = [];
    for (const row of rows) {
      const loaded = yield* loadT3workContextRefreshJob(String(row.job_id));
      if (loaded && loaded.status !== "completed") {
        jobs.push(loaded);
      }
    }
    return jobs;
  });
}

export function loadT3workContextRefreshJob(jobId: string) {
  return Effect.gen(function* () {
    yield* ensureT3workContextCacheTables();
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<Record<string, unknown>>`
      SELECT * FROM t3work_context_refresh_jobs WHERE job_id = ${jobId} LIMIT 1
    `;
    const row = rows[0];
    return row ? readJobRow(row) : undefined;
  });
}

export function replaceT3workContextRefreshJobQueue(input: {
  readonly jobId: string;
  readonly queue: ReadonlyArray<T3workContextBackgroundQueueItem>;
}) {
  return Effect.gen(function* () {
    yield* ensureT3workContextCacheTables();
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DELETE FROM t3work_context_refresh_job_queue WHERE job_id = ${input.jobId}`;
    for (const item of input.queue) {
      yield* sql`
        INSERT INTO t3work_context_refresh_job_queue (
          job_id, resource_key, depth, enqueued_at, failure_count
        ) VALUES (
          ${input.jobId}, ${item.resourceKey}, ${item.depth}, ${item.enqueuedAt},
          ${item.failureCount ?? 0}
        )
      `;
    }
  });
}

export function loadT3workContextRefreshJobQueue(jobId: string) {
  return Effect.gen(function* () {
    yield* ensureT3workContextCacheTables();
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<Record<string, unknown>>`
      SELECT resource_key, depth, enqueued_at, failure_count
      FROM t3work_context_refresh_job_queue
      WHERE job_id = ${jobId}
      ORDER BY enqueued_at ASC
    `;
    return rows.map((row) => ({
      resourceKey: String(row.resource_key),
      depth: Number(row.depth),
      enqueuedAt: Number(row.enqueued_at),
      ...(Number(row.failure_count) > 0 ? { failureCount: Number(row.failure_count) } : {}),
    }));
  });
}

export function replaceT3workContextRefreshJobSeen(input: {
  readonly jobId: string;
  readonly seen: ReadonlyArray<string>;
}) {
  return Effect.gen(function* () {
    yield* ensureT3workContextCacheTables();
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DELETE FROM t3work_context_refresh_job_seen WHERE job_id = ${input.jobId}`;
    for (const resourceKey of input.seen) {
      yield* sql`
        INSERT INTO t3work_context_refresh_job_seen (job_id, resource_key)
        VALUES (${input.jobId}, ${resourceKey})
      `;
    }
  });
}

export function loadT3workContextRefreshJobSeen(jobId: string) {
  return Effect.gen(function* () {
    yield* ensureT3workContextCacheTables();
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ resource_key: string }>`
      SELECT resource_key FROM t3work_context_refresh_job_seen WHERE job_id = ${jobId}
    `;
    return rows.map((row) => String(row.resource_key));
  });
}
