import { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import type { OrchestrationEventReplayFilter } from "../../orchestration/t3team-eventReplayFilter.ts";
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

  return (filters) => {
    if (filters.length === 0) return Stream.empty;
    const matching = sql.or(filters.map(clause));
    const readPage = SqlSchema.findAll({
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
        WHERE sequence > ${sequenceExclusive} AND ${matching}
        ORDER BY sequence ASC
        LIMIT ${PAGE_SIZE}
      `,
    });
    return Stream.paginate(0, (cursor) =>
      readPage({ sequenceExclusive: cursor }).pipe(
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
  };
}
