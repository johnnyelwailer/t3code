import type { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { T3workTurnToolContext } from "./t3work-toolBroker.ts";

export interface T3workThreadToolContextStoreShape {
  readonly get: (threadId: ThreadId) => Effect.Effect<T3workTurnToolContext | undefined, never>;
  readonly put: (input: {
    readonly threadId: ThreadId;
    readonly toolContext?: T3workTurnToolContext | null;
  }) => Effect.Effect<void, never>;
}

export class T3workThreadToolContextStore extends Context.Service<
  T3workThreadToolContextStore,
  T3workThreadToolContextStoreShape
>()("t3/t3work/T3workThreadToolContextStore") {}

const createT3workThreadToolContextStore = Effect.fn("createT3workThreadToolContextStore")(() => {
  const contexts = new Map<ThreadId, T3workTurnToolContext>();

  const get: T3workThreadToolContextStoreShape["get"] = (threadId) =>
    Effect.sync(() => contexts.get(threadId));

  const put: T3workThreadToolContextStoreShape["put"] = ({ threadId, toolContext }) =>
    Effect.sync(() => {
      if (toolContext) {
        contexts.set(threadId, toolContext);
        return;
      }

      contexts.delete(threadId);
    });

  return Effect.succeed({ get, put } satisfies T3workThreadToolContextStoreShape);
});

export const T3workThreadToolContextStoreLive = Layer.effect(
  T3workThreadToolContextStore,
  createT3workThreadToolContextStore(),
);
