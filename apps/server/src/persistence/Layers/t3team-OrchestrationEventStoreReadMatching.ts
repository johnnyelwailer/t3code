import { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import type { OrchestrationEventReplayFilter } from "../../t3team-orchestration/t3team-eventReplayFilter.ts";
import {
  toPersistenceDecodeError,
  toPersistenceSqlError,
  type OrchestrationEventStoreError,
} from "../Errors.ts";
import type { OrchestrationEventStoreShape } from "../Services/OrchestrationEventStore.ts";

const decodeEvent = Schema.decodeUnknownEffect(OrchestrationEvent);
const PAGE_SIZE = 500;

/**
 * `OrchestrationEventStore.readMatching`: the SQL form of
 * `matchesEventReplayFilters`, paged by sequence. Rides the
 * `(event_type, sequence)` index (migration 83); the payload is only parsed for
 * the activity-kind / message-role narrowing, never for unrelated event types.
 */
export function makeReadMatching<Row>(input: {
  readonly sql: SqlClient.SqlClient;
  readonly rowSchema: Schema.Codec<Row, unknown>;
}): NonNullable<OrchestrationEventStoreShape["readMatching"]> {
  const { sql } = input;
  const clause = (filter: OrchestrationEventReplayFilter) => {
    if ("activityKinds" in filter) {
      return filter.activityKinds.length === 0
        ? sql`0`
        : sql`(event_type = ${filter.type} AND json_extract(payload_json, '$.activity.kind') IN ${sql.in(filter.activityKinds)})`;
    }
    if ("messageRole" in filter) {
      return sql`(event_type = ${filter.type} AND json_extract(payload_json, '$.role') = ${filter.messageRole})`;
    }
    return sql`event_type = ${filter.type}`;
  };

  const readPage = (filter: OrchestrationEventReplayFilter) =>
    SqlSchema.findAll({
      Request: Schema.Struct({ sequenceExclusive: Schema.Number }),
      Result: input.rowSchema,
      execute: ({ sequenceExclusive }) => sql`
        SELECT
          sequence,
          event_id AS "eventId",
          event_type AS "type",
          aggregate_kind AS "aggregateKind",
          stream_id AS "aggregateId",
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          causation_event_id AS "causationEventId",
          correlation_id AS "correlationId",
          payload_json AS "payload",
          metadata_json AS "metadata"
        FROM orchestration_events
        WHERE sequence > ${sequenceExclusive} AND ${clause(filter)}
        ORDER BY sequence ASC
        LIMIT ${PAGE_SIZE}
      `,
    });
  const readFilter = (filter: OrchestrationEventReplayFilter) =>
    Stream.paginate(0, (cursor: number) =>
      readPage(filter)({ sequenceExclusive: cursor }).pipe(
        Effect.mapError((cause): OrchestrationEventStoreError =>
          Schema.isSchemaError(cause)
            ? toPersistenceDecodeError("OrchestrationEventStore.readMatching:decodeRows")(cause)
            : toPersistenceSqlError("OrchestrationEventStore.readMatching:query")(cause),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) =>
            decodeEvent(row).pipe(
              Effect.mapError(
                toPersistenceDecodeError("OrchestrationEventStore.readMatching:rowToEvent"),
              ),
            ),
          ),
        ),
        Effect.map((events) => {
          const last = events.at(-1);
          return [
            events,
            last === undefined || events.length < PAGE_SIZE
              ? Option.none()
              : Option.some(last.sequence),
          ] as const;
        }),
      ),
    );

  // One index-ordered query per filter, merged by sequence. OR-ing the clauses
  // into one statement made SQLite collect and sort every branch on every page
  // (a rare activity kind re-scanned all activity payloads per page: ~12 s of
  // blocking reads at boot). The merged set is the matches, not the log.
  return (filters) => {
    const distinct = [
      ...new Map(filters.map((filter) => [JSON.stringify(filter), filter])).values(),
    ];
    return Stream.fromEffect(
      Effect.forEach(distinct, (filter) => Stream.runCollect(readFilter(filter))).pipe(
        Effect.map((chunks) => {
          const bySequence = new Map<number, OrchestrationEvent>();
          for (const chunk of chunks)
            for (const event of chunk) bySequence.set(event.sequence, event);
          return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
        }),
      ),
    ).pipe(Stream.flatMap((events) => Stream.fromIterable(events)));
  };
}
