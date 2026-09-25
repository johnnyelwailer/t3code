/**
 * SQLite implementation of the resource-pressure event journal.
 *
 * @module t3team.persistence.Layers.ResourcePressureEvents
 */
import { ResourcePressureLevel } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  RESOURCE_PRESSURE_EVENT_RETENTION,
  ResourcePressureEventRepository,
  type ResourcePressureEventRepositoryShape,
} from "../Services/t3team-ResourcePressureEvents.ts";

const ReasonsFromJson = Schema.fromJsonString(Schema.Array(Schema.String));

const ResourcePressureEventDbRow = Schema.Struct({
  id: Schema.Number,
  occurredAt: Schema.Number,
  fromLevel: ResourcePressureLevel,
  toLevel: ResourcePressureLevel,
  availableMemoryBytes: Schema.Number,
  totalMemoryBytes: Schema.Number,
  appTreeRssBytes: Schema.Number,
  reasons: ReasonsFromJson,
  topProcessName: Schema.NullOr(Schema.String),
  topProcessRssBytes: Schema.Number,
});

const AppendRequest = Schema.Struct({
  occurredAt: Schema.Number,
  fromLevel: Schema.String,
  toLevel: Schema.String,
  availableMemoryBytes: Schema.Number,
  totalMemoryBytes: Schema.Number,
  appTreeRssBytes: Schema.Number,
  reasons: ReasonsFromJson,
  topProcessName: Schema.NullOr(Schema.String),
  topProcessRssBytes: Schema.Number,
});

const makeResourcePressureEventRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const insertRow = SqlSchema.void({
    Request: AppendRequest,
    execute: (row) =>
      sql`
        INSERT INTO resource_pressure_events (
          occurred_at, from_level, to_level, available_memory_bytes, total_memory_bytes,
          app_tree_rss_bytes, reasons_json, top_process_name, top_process_rss_bytes
        )
        VALUES (
          ${row.occurredAt}, ${row.fromLevel}, ${row.toLevel}, ${row.availableMemoryBytes},
          ${row.totalMemoryBytes}, ${row.appTreeRssBytes}, ${row.reasons},
          ${row.topProcessName}, ${row.topProcessRssBytes}
        )
      `,
  });

  const pruneRows = SqlSchema.void({
    Request: Schema.Struct({ keep: Schema.Number }),
    execute: ({ keep }) =>
      sql`
        DELETE FROM resource_pressure_events
        WHERE id NOT IN (
          SELECT id FROM resource_pressure_events ORDER BY id DESC LIMIT ${keep}
        )
      `,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.Struct({ limit: Schema.Number }),
    Result: ResourcePressureEventDbRow,
    execute: ({ limit }) =>
      sql`
        SELECT
          id,
          occurred_at AS "occurredAt",
          from_level AS "fromLevel",
          to_level AS "toLevel",
          available_memory_bytes AS "availableMemoryBytes",
          total_memory_bytes AS "totalMemoryBytes",
          app_tree_rss_bytes AS "appTreeRssBytes",
          reasons_json AS "reasons",
          top_process_name AS "topProcessName",
          top_process_rss_bytes AS "topProcessRssBytes"
        FROM resource_pressure_events
        ORDER BY id DESC
        LIMIT ${limit}
      `,
  });

  const accumulationRow = SqlSchema.findAll({
    Request: Schema.Struct({}),
    Result: Schema.Struct({
      worktreeThreadCount: Schema.Number,
      archivedWorktreeThreadCount: Schema.Number,
    }),
    execute: () =>
      sql`
        SELECT
          COUNT(*) AS "worktreeThreadCount",
          COALESCE(SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END), 0)
            AS "archivedWorktreeThreadCount"
        FROM projection_threads
        WHERE worktree_path IS NOT NULL AND deleted_at IS NULL
      `,
  });

  const readAccumulation: ResourcePressureEventRepositoryShape["readAccumulation"] =
    accumulationRow({}).pipe(
      Effect.map((rows) => rows[0] ?? { worktreeThreadCount: 0, archivedWorktreeThreadCount: 0 }),
      Effect.mapError(
        toPersistenceSqlError("ResourcePressureEventRepository.readAccumulation:query"),
      ),
    );

  const append: ResourcePressureEventRepositoryShape["append"] = (event) =>
    insertRow(event).pipe(
      Effect.andThen(pruneRows({ keep: RESOURCE_PRESSURE_EVENT_RETENTION })),
      Effect.mapError(toPersistenceSqlError("ResourcePressureEventRepository.append:query")),
    );

  const listRecent: ResourcePressureEventRepositoryShape["listRecent"] = ({ limit }) =>
    listRows({ limit: Math.max(0, Math.floor(limit)) }).pipe(
      Effect.mapError(toPersistenceSqlError("ResourcePressureEventRepository.listRecent:query")),
    );

  return ResourcePressureEventRepository.of({ append, listRecent, readAccumulation });
});

export const ResourcePressureEventRepositoryLive = Layer.effect(
  ResourcePressureEventRepository,
  makeResourcePressureEventRepository,
);
