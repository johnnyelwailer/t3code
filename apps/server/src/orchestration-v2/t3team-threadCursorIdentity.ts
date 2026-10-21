import type { EventId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import type { OrchestrationEventStore } from "../persistence/OrchestrationEventStore.ts";

type EventReader = Pick<OrchestrationEventStore["Service"], "readAgentEventId">;

/**
 * Event id of the thread's stored event at `sequence`, or undefined when none
 * exists. A read failure also reads as unknown: callers then fall back to the
 * snapshot path, which is always safe, instead of failing the subscription.
 */
const threadEventIdAtSequence = (
  events: EventReader,
  threadId: ThreadId,
  sequence: number,
): Effect.Effect<EventId | undefined> =>
  sequence < 1
    ? Effect.succeed(undefined)
    : // Id-only query: the cursor event can carry a payload far above the replay decode budget.
      events
        .readAgentEventId({ threadId, sequence })
        .pipe(Effect.catch(() => Effect.succeed(undefined)));

/**
 * Whether any stored event occupies `sequence`. Sequences are AUTOINCREMENT and
 * never reused, so an empty slot inside the stored range means its event was
 * deleted, as background compaction does to superseded thread events. A read
 * failure reads as occupied, which sends the client the always-safe snapshot.
 */
const sequenceOccupied = (sequence: number): Effect.Effect<boolean, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows =
      yield* sql`SELECT 1 AS present FROM orchestration_events WHERE sequence = ${sequence}`;
    return rows.length > 0;
  }).pipe(Effect.catch(() => Effect.succeed(true)));

/**
 * Whether a resuming client's cursor belongs to this server's timeline.
 * Sequences are AUTOINCREMENT, so after a state restore or with two servers
 * sharing an environment id a cursor can sit inside the new timeline while
 * naming different events. No `afterEventId` (older client) keeps the legacy
 * sequence-only behaviour.
 *
 * Callers check first that the cursor is at or below the thread's high-water
 * sequence. When the cursor's event is gone and nothing else holds its
 * sequence, compaction deleted it: compaction keeps every event a replay
 * needs, so the cursor still matches. A sequence held by another event, or by
 * another thread's event, is still a different timeline.
 */
export const threadCursorIdentityMatches = (
  events: EventReader,
  threadId: ThreadId,
  cursor: { readonly afterSequence: number; readonly afterEventId?: EventId },
): Effect.Effect<boolean, never, SqlClient.SqlClient> => {
  const { afterEventId } = cursor;
  if (afterEventId === undefined) return Effect.succeed(true);
  if (cursor.afterSequence < 1) return Effect.succeed(false);
  return threadEventIdAtSequence(events, threadId, cursor.afterSequence).pipe(
    Effect.flatMap((eventId) =>
      eventId !== undefined
        ? Effect.succeed(eventId === afterEventId)
        : sequenceOccupied(cursor.afterSequence).pipe(Effect.map((occupied) => !occupied)),
    ),
  );
};

/** Snapshot field a client echoes back as `afterEventId`; empty when unknown. */
export const snapshotEventIdFields = (
  events: EventReader,
  threadId: ThreadId,
  snapshotSequence: number,
): Effect.Effect<{ readonly snapshotEventId?: EventId }> =>
  threadEventIdAtSequence(events, threadId, snapshotSequence).pipe(
    Effect.map((snapshotEventId) => (snapshotEventId === undefined ? {} : { snapshotEventId })),
  );
