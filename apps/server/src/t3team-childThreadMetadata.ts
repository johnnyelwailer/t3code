/**
 * Durable fork metadata of a delegated child thread (`t3team_child_thread_metadata`,
 * migration 90): the work item (ticket) it belongs to and the visible thread it is
 * placed under when that differs from its lineage parent (a child started from a
 * hidden workflow helper is shown under the thread that launched the workflow), plus
 * the skills its delegate_task requested (migration 102, `skills` column).
 *
 * The `skills` column stores the REQUESTED skill names only — the host does not know the
 * skill catalog; the child's driver resolves them from its pack registry at session
 * start. NULL = the child was not started with skill delegation.
 *
 * The parent/child relation itself is V2 lineage (`shell.lineage.parentThreadId`);
 * this table only carries what lineage cannot. Written by the delegate_task
 * extension, read by placement and work-digest readers.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export class T3TeamChildThreadMetadataError extends Schema.TaggedError<T3TeamChildThreadMetadataError>()(
  "T3TeamChildThreadMetadataError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

export interface T3TeamChildThreadMetadataRecord {
  readonly childThreadId: string;
  readonly parentThreadId: string;
  readonly placementThreadId: string | null;
  readonly ticketId: string | null;
  /** Requested skill names (host-validated format only); null = no skill delegation. */
  readonly skills: ReadonlyArray<string> | null;
  readonly createdAt: string;
}

export class T3TeamChildThreadMetadata extends Context.Service<
  T3TeamChildThreadMetadata,
  {
    /** Idempotent per child: a later write replaces the earlier one. */
    readonly upsert: (input: {
      readonly childThreadId: ThreadId;
      readonly parentThreadId: ThreadId;
      readonly placementThreadId?: string | null;
      readonly ticketId?: string | null;
      readonly skills?: ReadonlyArray<string> | null;
    }) => Effect.Effect<void, T3TeamChildThreadMetadataError>;
    readonly listByChildThreadIds: (
      childThreadIds: ReadonlyArray<string>,
    ) => Effect.Effect<
      ReadonlyArray<T3TeamChildThreadMetadataRecord>,
      T3TeamChildThreadMetadataError
    >;
  }
>()("t3/t3team-childThreadMetadata/T3TeamChildThreadMetadata") {}

const fail = (operation: string) => (cause: unknown) =>
  new T3TeamChildThreadMetadataError({ operation, cause });

/**
 * The `skills` column is a JSON array of the requested names. A malformed row means the
 * table was written outside this host (or corrupted): raise, never return a lie.
 */
const parseSkillsColumn = (raw: string | null): ReadonlyArray<string> | null => {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new T3TeamChildThreadMetadataError({ operation: "listByChildThreadIds", cause });
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new T3TeamChildThreadMetadataError({ operation: "listByChildThreadIds", cause: raw });
  }
  return parsed;
};

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsert: T3TeamChildThreadMetadata["Service"]["upsert"] = (input) =>
    Effect.gen(function* () {
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      yield* sql`
        INSERT INTO t3team_child_thread_metadata
          (child_thread_id, parent_thread_id, placement_thread_id, ticket_id, skills, created_at)
        VALUES (${input.childThreadId}, ${input.parentThreadId},
          ${input.placementThreadId ?? null}, ${input.ticketId ?? null},
          ${input.skills === undefined || input.skills === null
            ? null
            : JSON.stringify(input.skills)}, ${createdAt})
        ON CONFLICT (child_thread_id) DO UPDATE SET
          parent_thread_id = excluded.parent_thread_id,
          placement_thread_id = excluded.placement_thread_id,
          ticket_id = excluded.ticket_id,
          skills = excluded.skills
      `;
    }).pipe(Effect.mapError(fail("upsert")));

  const listByChildThreadIds: T3TeamChildThreadMetadata["Service"]["listByChildThreadIds"] = (
    childThreadIds,
  ) =>
    childThreadIds.length === 0
      ? Effect.succeed([])
      : sql<{ readonly childThreadId: string; readonly parentThreadId: string; readonly placementThreadId: string | null; readonly ticketId: string | null; readonly skills: string | null; readonly createdAt: string }>`
          SELECT child_thread_id AS "childThreadId", parent_thread_id AS "parentThreadId",
            placement_thread_id AS "placementThreadId", ticket_id AS "ticketId",
            skills, created_at AS "createdAt"
          FROM t3team_child_thread_metadata
          WHERE ${sql.in("child_thread_id", childThreadIds)}
        `.pipe(
          Effect.map((rows) =>
            rows.map((row) => ({
              ...row,
              skills: parseSkillsColumn(row.skills),
            })),
          ),
          Effect.mapError(fail("listByChildThreadIds")),
        );

  return T3TeamChildThreadMetadata.of({ upsert, listByChildThreadIds });
});

export const T3TeamChildThreadMetadataLive = Layer.effect(T3TeamChildThreadMetadata, make);
