/**
 * Durable fork metadata of a delegated child thread (`t3team_child_thread_metadata`,
 * migration 90): the work item (ticket) it belongs to and the visible thread it is
 * placed under when that differs from its lineage parent (a child started from a
 * hidden workflow helper is shown under the thread that launched the workflow).
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

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsert: T3TeamChildThreadMetadata["Service"]["upsert"] = (input) =>
    Effect.gen(function* () {
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      yield* sql`
        INSERT INTO t3team_child_thread_metadata
          (child_thread_id, parent_thread_id, placement_thread_id, ticket_id, created_at)
        VALUES (${input.childThreadId}, ${input.parentThreadId},
          ${input.placementThreadId ?? null}, ${input.ticketId ?? null}, ${createdAt})
        ON CONFLICT (child_thread_id) DO UPDATE SET
          parent_thread_id = excluded.parent_thread_id,
          placement_thread_id = excluded.placement_thread_id,
          ticket_id = excluded.ticket_id
      `;
    }).pipe(Effect.mapError(fail("upsert")));

  const listByChildThreadIds: T3TeamChildThreadMetadata["Service"]["listByChildThreadIds"] = (
    childThreadIds,
  ) =>
    childThreadIds.length === 0
      ? Effect.succeed([])
      : sql<T3TeamChildThreadMetadataRecord>`
          SELECT child_thread_id AS "childThreadId", parent_thread_id AS "parentThreadId",
            placement_thread_id AS "placementThreadId", ticket_id AS "ticketId",
            created_at AS "createdAt"
          FROM t3team_child_thread_metadata
          WHERE ${sql.in("child_thread_id", childThreadIds)}
        `.pipe(Effect.mapError(fail("listByChildThreadIds")));

  return T3TeamChildThreadMetadata.of({ upsert, listByChildThreadIds });
});

export const T3TeamChildThreadMetadataLive = Layer.effect(T3TeamChildThreadMetadata, make);
