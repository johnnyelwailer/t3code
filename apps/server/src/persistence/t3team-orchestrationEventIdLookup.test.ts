import { EventId, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Tracer from "effect/Tracer";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "./Migrations.ts";
import * as OrchestrationEventStore from "./OrchestrationEventStore.ts";
import * as SqlitePersistence from "./Sqlite.ts";

const THREAD = ThreadId.make("lookup-thread");
const layerEventStore = OrchestrationEventStore.layer.pipe(
  Layer.provideMerge(SqlitePersistence.layerMemory),
);

const insertEvent = (
  sql: SqlClient.SqlClient,
  eventId: string,
  streamId: string,
  version: number,
  payload: string,
  streamVersion = 1,
) =>
  sql`
    INSERT INTO orchestration_events (
      event_id, aggregate_kind, stream_id, stream_version, event_type, occurred_at,
      actor_kind, payload_json, metadata_json, application_event_version
    )
    VALUES (
      ${eventId}, 'thread', ${streamId}, ${streamVersion}, 'provider-session.detached',
      '2026-09-03T00:00:00.000Z', 'server', ${payload}, '{}', ${version}
    )
    RETURNING sequence
  `;

it.effect("reads a cursor event id by index without touching its payload", () =>
  Effect.gen(function* () {
    const store = yield* OrchestrationEventStore.OrchestrationEventStore;
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations();
    // A payload no decoder accepts: any path that reads it fails, the id lookup must not.
    const [undecodable] = yield* insertEvent(sql, "event-undecodable", THREAD, 2, "not json");
    const [otherThread] = yield* insertEvent(sql, "event-other", "other-thread", 2, "{}");
    const [legacy] = yield* insertEvent(sql, "event-legacy", THREAD, 1, "{}", 2);

    assert.equal(
      yield* store.readAgentEventId({
        threadId: THREAD,
        sequence: undecodable!.sequence as number,
      }),
      EventId.make("event-undecodable"),
    );
    const decoded = yield* store
      .readAgentEvents({ threadId: THREAD, afterSequence: 0 })
      .pipe(Stream.runCollect, Effect.result);
    assert.equal(decoded._tag, "Failure");

    // Another thread's sequence and legacy (version 1) rows are not this thread's events.
    assert.equal(
      yield* store.readAgentEventId({
        threadId: THREAD,
        sequence: otherThread!.sequence as number,
      }),
      undefined,
    );
    assert.equal(
      yield* store.readAgentEventId({ threadId: THREAD, sequence: legacy!.sequence as number }),
      undefined,
    );
    assert.equal(yield* store.readAgentEventId({ threadId: THREAD, sequence: 9_999 }), undefined);

    const statements: Array<string> = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        const end = span.end.bind(span);
        span.end = (endTime, exit) => {
          end(endTime, exit);
          const query = span.attributes.get("db.query.text");
          if (typeof query === "string") statements.push(query);
        };
        return span;
      },
    });
    yield* store
      .readAgentEventId({ threadId: THREAD, sequence: undecodable!.sequence as number })
      .pipe(Effect.withTracer(tracer));
    assert.equal(statements.length, 1);
    assert.notInclude(statements[0]!, "payload_json");
    const plan = yield* sql.unsafe<{ readonly detail: string }>(
      `EXPLAIN QUERY PLAN ${statements[0]}`,
      [THREAD, undecodable!.sequence],
    );
    assert.match(
      plan.map((row) => row.detail).join("\n"),
      /SEARCH orchestration_events USING INDEX idx_orchestration_events_agent_stream_sequence \(stream_id=\? AND sequence=\?(?: AND rowid=\?)?\)/,
    );
  }).pipe(Effect.provide(layerEventStore)),
);
