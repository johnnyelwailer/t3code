/**
 * Reacts to `thread.turn-interrupt-requested` events raised with `cascade:
 * true` (a "Stop incl. sub-runs" click) by interrupting every descendant of
 * the stopped thread — see t3team-threadStopCascade.ts for the tree walk.
 *
 * Split out of the interrupt decider case because the walk needs SQL access
 * to the persisted handoff activities; the decider itself stays pure/sync.
 *
 * @module t3team-threadStopCascadeReactor
 */
import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { stopThreadDescendants } from "./t3team-threadStopCascade.ts";

export const T3TeamThreadStopCascadeReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;

    const handleEvent = (
      event: OrchestrationEvent,
    ): Effect.Effect<void, never, SqlClient.SqlClient> => {
      if (event.type !== "thread.turn-interrupt-requested" || event.payload.cascade !== true) {
        return Effect.void;
      }
      return stopThreadDescendants({
        threadId: event.payload.threadId,
        triggerEventId: event.eventId,
        createdAt: event.payload.createdAt,
        byUser: event.payload.byUser === true,
        dispatch: engine.dispatch,
      }).pipe(
        Effect.tap(({ attempted, failed }) =>
          failed > 0
            ? Effect.logWarning("t3team cascade stop failed to interrupt some descendants", {
                threadId: event.payload.threadId,
                attempted,
                failed,
              })
            : Effect.void,
        ),
        Effect.catchCause((cause) =>
          Effect.logWarning("t3team thread-stop-cascade reactor failed to stop descendants", {
            threadId: event.payload.threadId,
            cause: Cause.pretty(cause),
          }),
        ),
        Effect.asVoid,
      );
    };

    const handleSafely = (event: OrchestrationEvent) =>
      handleEvent(event).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
          return Effect.logWarning("t3team thread-stop-cascade reactor failed to process event", {
            eventType: event.type,
            cause: Cause.pretty(cause),
          });
        }),
      );

    yield* Effect.forkScoped(Stream.runForEach(engine.streamDomainEvents, handleSafely));
  }),
);
