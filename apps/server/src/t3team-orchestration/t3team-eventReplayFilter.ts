import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Stream from "effect/Stream";

import type { OrchestrationEventStoreError } from "../persistence/Errors.ts";
import type { OrchestrationEngineShape } from "./Services/OrchestrationEngine.ts";

/**
 * One class of events a startup rehydrate folds over. `activityKinds` narrows
 * `thread.activity-appended`, `messageRole` narrows `thread.message-sent`.
 *
 * Each collector declares the filter for exactly the events it reads, next to
 * the fold itself, so a rehydrate decodes a few thousand events instead of the
 * whole log (four full replays at boot peaked at 6.3 GB on a 704k-event log).
 */
export type OrchestrationEventReplayFilter =
  | {
      readonly type: "thread.activity-appended";
      readonly activityKinds: ReadonlyArray<string>;
    }
  | {
      readonly type: "thread.message-sent";
      readonly messageRole: "user" | "assistant" | "system";
    }
  | {
      readonly type: Exclude<
        OrchestrationEvent["type"],
        "thread.activity-appended" | "thread.message-sent"
      >;
    };

/** The in-memory form of the store's SQL filter; the two must agree. */
export function matchesEventReplayFilters(
  event: OrchestrationEvent,
  filters: ReadonlyArray<OrchestrationEventReplayFilter>,
): boolean {
  return filters.some((filter) => {
    if (filter.type !== event.type) return false;
    if ("activityKinds" in filter) {
      return (
        event.type === "thread.activity-appended" &&
        filter.activityKinds.includes(event.payload.activity.kind)
      );
    }
    if ("messageRole" in filter) {
      return event.type === "thread.message-sent" && event.payload.role === filter.messageRole;
    }
    return true;
  });
}

/**
 * The events matching `filters`, in sequence order. Uses the store's SQL filter
 * when the engine has one; lightweight test engines fall back to a full read
 * filtered in memory with the same predicate.
 */
export function readEventsMatching(
  engine: Pick<OrchestrationEngineShape, "readEvents" | "readEventsMatching">,
  filters: ReadonlyArray<OrchestrationEventReplayFilter>,
): Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError> {
  if (engine.readEventsMatching !== undefined) return engine.readEventsMatching(filters);
  return engine
    .readEvents(0, Number.MAX_SAFE_INTEGER)
    .pipe(Stream.filter((event) => matchesEventReplayFilters(event, filters)));
}
