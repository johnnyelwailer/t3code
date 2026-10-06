/**
 * Reads the fork's frozen V1 thread relations for the one-shot lineage cutover
 * (`t3team-legacyLineageCutover.ts`). V1 kept them outside anything the
 * upstream importer copies:
 *
 * - delegated/workflow children: `t3team.handoff.created` on the child
 *   (`parentThreadId`, `ticketId`) and `t3team.handoff.started` on the parent
 *   (`childThreadId`) in `projection_thread_activities` — newest wins, the
 *   child-side record before the parent-side one;
 * - forks: the system note whose `t3team_ext_json.forkSource.threadId` names
 *   the source, in `projection_thread_messages`;
 * - `projection_threads.retention` (`ephemeral` helpers) and
 *   `environment_json` (cross-environment binding).
 *
 * Every read tolerates a missing table or column (an upstream-only database,
 * or a fork database from before the column existed) by reading nothing.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export interface LegacyRelation {
  readonly childThreadId: string;
  readonly parentThreadId: string;
  readonly relationshipToParent: "subagent" | "fork";
  readonly ticketId: string | null;
}

export interface LegacyThreadFlags {
  readonly ephemeralThreadIds: ReadonlyArray<string>;
  readonly environments: ReadonlyArray<{ readonly threadId: string; readonly json: string }>;
}

const text = (column: string) => `NULLIF(TRIM(CAST(${column} AS TEXT)), '')`;

const columnsOf = (sql: SqlClient.SqlClient, table: string) =>
  sql<{ readonly name: string }>`SELECT name FROM pragma_table_info(${table})`.pipe(
    Effect.map((rows) => new Set(rows.map((row) => row.name))),
    Effect.orElseSucceed(() => new Set<string>()),
  );

export const readLegacyRelations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const relationByChild = new Map<string, LegacyRelation>();
  const keep = (relation: LegacyRelation) => {
    if (relation.childThreadId === relation.parentThreadId) return;
    if (!relationByChild.has(relation.childThreadId)) {
      relationByChild.set(relation.childThreadId, relation);
    }
  };

  if ((yield* columnsOf(sql, "projection_thread_activities")).has("payload_json")) {
    const handoffs = yield* sql<{
      readonly threadId: string;
      readonly kind: string;
      readonly parentThreadId: string | null;
      readonly childThreadId: string | null;
      readonly ticketId: string | null;
    }>`
      SELECT thread_id AS "threadId", kind,
        ${sql.literal(text("json_extract(payload_json, '$.parentThreadId')"))} AS "parentThreadId",
        ${sql.literal(text("json_extract(payload_json, '$.childThreadId')"))} AS "childThreadId",
        ${sql.literal(text("json_extract(payload_json, '$.ticketId')"))} AS "ticketId"
      FROM projection_thread_activities
      WHERE kind IN ('t3team.handoff.created', 't3team.handoff.started')
        AND json_valid(payload_json)
      ORDER BY CASE kind WHEN 't3team.handoff.created' THEN 0 ELSE 1 END,
        created_at DESC, activity_id DESC
    `.pipe(Effect.orElseSucceed(() => []));
    for (const row of handoffs) {
      const created = row.kind === "t3team.handoff.created";
      const childThreadId = created ? row.threadId : row.childThreadId;
      const parentThreadId = created ? row.parentThreadId : row.threadId;
      if (childThreadId === null || parentThreadId === null) continue;
      keep({
        childThreadId,
        parentThreadId,
        relationshipToParent: "subagent",
        ticketId: created ? row.ticketId : null,
      });
    }
  }

  const messageColumns = yield* columnsOf(sql, "projection_thread_messages");
  const extColumn = ["t3team_ext_json", "t3work_ext_json"].find((name) => messageColumns.has(name));
  if (extColumn !== undefined) {
    const source = `json_extract(${extColumn}, '$.forkSource.threadId')`;
    const forks = yield* sql<{ readonly threadId: string; readonly sourceThreadId: string }>`
      SELECT thread_id AS "threadId", ${sql.literal(text(source))} AS "sourceThreadId"
      FROM projection_thread_messages
      WHERE ${sql.literal(extColumn)} IS NOT NULL AND json_valid(${sql.literal(extColumn)})
        AND ${sql.literal(text(source))} IS NOT NULL
      ORDER BY created_at ASC
    `.pipe(Effect.orElseSucceed(() => []));
    for (const row of forks) {
      keep({
        childThreadId: row.threadId,
        parentThreadId: row.sourceThreadId,
        relationshipToParent: "fork",
        ticketId: null,
      });
    }
  }
  return [...relationByChild.values()];
});

export const readLegacyThreadFlags = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* columnsOf(sql, "projection_threads");
  const ephemeral = columns.has("retention")
    ? yield* sql<{ readonly threadId: string }>`
        SELECT thread_id AS "threadId" FROM projection_threads WHERE retention = 'ephemeral'
      `.pipe(Effect.orElseSucceed(() => []))
    : [];
  const environments = columns.has("environment_json")
    ? yield* sql<{ readonly threadId: string; readonly json: string }>`
        SELECT thread_id AS "threadId", environment_json AS "json" FROM projection_threads
        WHERE environment_json IS NOT NULL AND json_valid(environment_json)
      `.pipe(Effect.orElseSucceed(() => []))
    : [];
  return {
    ephemeralThreadIds: ephemeral.map((row) => row.threadId),
    environments,
  } satisfies LegacyThreadFlags;
});

/** Parents before children, so each child's lineage root is its ancestor's final root. */
export function orderParentsFirst(
  relations: ReadonlyArray<LegacyRelation>,
): ReadonlyArray<LegacyRelation> {
  const parentOf = new Map(relations.map((relation) => [relation.childThreadId, relation]));
  const depth = (threadId: string) => {
    let hops = 0;
    for (let at = parentOf.get(threadId); at !== undefined && hops < 64; hops += 1) {
      at = parentOf.get(at.parentThreadId);
    }
    return hops;
  };
  return relations
    .map((relation) => ({ relation, depth: depth(relation.childThreadId) }))
    .toSorted((a, b) => a.depth - b.depth)
    .map((entry) => entry.relation);
}
