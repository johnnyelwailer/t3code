/**
 * What a silent turn may legitimately be waiting on, read from the run's routed provider events
 * for the turn-inactivity watchdog (`t3team-turnInactivityWatchdog.ts`). A provider that waits
 * emits nothing, so silence alone must not end such a turn:
 *
 * - a runtime request (an approval, a question, user input): the provider waits for a person, for
 *   as long as that takes. Tracked by id from the stream and confirmed against the projection,
 *   because several adapters never report the answer on their own stream.
 * - an open tool call (an MCP tool such as a blocking `delegate_task` / `t3_thread_wait`, a
 *   command, a subagent): the budget stretches to {@link OPEN_TOOL_BUDGET_MS} — bounded, so a lost
 *   completion event cannot switch the watchdog off for good.
 *
 * @module t3team-turnInactivityWaits
 */
import {
  isOrchestrationV2WorkActive,
  type OrchestrationV2TurnItem,
  type RuntimeRequestId,
  type ThreadId,
  type TurnItemId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import type { ProviderAdapterV2Event } from "./ProviderAdapter.ts";

/** The longest blocking MCP wait upstream allows (60 min) plus slack for the call around it. */
export const OPEN_TOOL_BUDGET_MS = 62 * 60_000;

const TOOL_ITEM_TYPES: ReadonlySet<OrchestrationV2TurnItem["type"]> = new Set([
  "command_execution",
  "dynamic_tool",
  "subagent",
]);

/** A runtime request the run routed; `threadId` is absent for the run's own thread. */
export interface TurnRuntimeRequestRef {
  readonly threadId: ThreadId | undefined;
  readonly requestId: RuntimeRequestId;
}

export const makeTurnInactivityWaits = Effect.gen(function* () {
  const requests = yield* Ref.make<ReadonlyMap<string, TurnRuntimeRequestRef>>(new Map());
  const openTools = yield* Ref.make<ReadonlySet<TurnItemId>>(new Set());

  const observe = (event: ProviderAdapterV2Event) => {
    if (event.type === "runtime_request.updated") {
      const ref = { threadId: event.threadId, requestId: event.runtimeRequest.id };
      const key = `${ref.threadId ?? ""}\u0000${ref.requestId}`;
      return Ref.update(requests, (current) => {
        const next = new Map(current);
        if (event.runtimeRequest.status === "pending") next.set(key, ref);
        else next.delete(key);
        return next;
      });
    }
    if (event.type === "turn_item.updated" && TOOL_ITEM_TYPES.has(event.turnItem.type)) {
      const { id, status } = event.turnItem;
      return Ref.update(openTools, (current) => {
        const next = new Set(current);
        if (isOrchestrationV2WorkActive(status)) next.add(id);
        else next.delete(id);
        return next;
      });
    }
    return Effect.void;
  };

  return {
    observe,
    /** The inactivity budget to apply: stretched while a tool call is still open. */
    budgetMs: (baseMs: number) =>
      Ref.get(openTools).pipe(
        Effect.map((open) => (open.size > 0 ? Math.max(baseMs, OPEN_TOOL_BUDGET_MS) : baseMs)),
      ),
    /**
     * True while a runtime request this run raised still waits for its answer; answered ones are
     * forgotten so the projection is read only for the requests that may still be open.
     */
    awaitingAnswer: (isPending: (request: TurnRuntimeRequestRef) => Effect.Effect<boolean>) =>
      Effect.gen(function* () {
        const tracked = yield* Ref.get(requests);
        let waiting = false;
        for (const [key, request] of tracked) {
          if (yield* isPending(request)) {
            waiting = true;
            continue;
          }
          yield* Ref.update(requests, (current) => {
            const next = new Map(current);
            next.delete(key);
            return next;
          });
        }
        return waiting;
      }),
  };
});

export type TurnInactivityWaits = Effect.Success<typeof makeTurnInactivityWaits>;
