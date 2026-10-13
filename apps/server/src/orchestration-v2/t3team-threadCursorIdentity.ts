import type { EventId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

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
 * Whether a resuming client's cursor belongs to this server's timeline.
 * Sequences are AUTOINCREMENT, so after a state restore or with two servers
 * sharing an environment id a cursor can sit inside the new timeline while
 * naming different events. No `afterEventId` (older client) keeps the legacy
 * sequence-only behaviour.
 */
export const threadCursorIdentityMatches = (
  events: EventReader,
  threadId: ThreadId,
  cursor: { readonly afterSequence: number; readonly afterEventId?: EventId },
): Effect.Effect<boolean> =>
  cursor.afterEventId === undefined
    ? Effect.succeed(true)
    : threadEventIdAtSequence(events, threadId, cursor.afterSequence).pipe(
        Effect.map((eventId) => eventId === cursor.afterEventId),
      );

/** Snapshot field a client echoes back as `afterEventId`; empty when unknown. */
export const snapshotEventIdFields = (
  events: EventReader,
  threadId: ThreadId,
  snapshotSequence: number,
): Effect.Effect<{ readonly snapshotEventId?: EventId }> =>
  threadEventIdAtSequence(events, threadId, snapshotSequence).pipe(
    Effect.map((snapshotEventId) => (snapshotEventId === undefined ? {} : { snapshotEventId })),
  );
