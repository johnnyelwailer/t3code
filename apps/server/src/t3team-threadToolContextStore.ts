import type { T3TeamStoredViewContext, T3TeamViewContext, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { T3TeamTurnToolContext } from "./t3team-toolBroker.ts";

export interface T3TeamThreadToolContextStoreShape {
  readonly get: (threadId: ThreadId) => Effect.Effect<T3TeamTurnToolContext | undefined, never>;
  readonly put: (input: {
    readonly threadId: ThreadId;
    readonly toolContext?: T3TeamTurnToolContext | null;
  }) => Effect.Effect<void, never>;
  /** The view the thread was opened beside, as last published; `undefined` when none. */
  readonly getViewContext: (
    threadId: ThreadId,
  ) => Effect.Effect<T3TeamStoredViewContext | undefined, never>;
  /** `viewContext: null` clears. Process-local like the tool context: a restart drops it. */
  readonly putViewContext: (input: {
    readonly threadId: ThreadId;
    readonly viewContext: T3TeamViewContext | null;
    readonly nowMs: number;
  }) => Effect.Effect<void, never>;
}

export class T3TeamThreadToolContextStore extends Context.Service<
  T3TeamThreadToolContextStore,
  T3TeamThreadToolContextStoreShape
>()("t3/t3team-threadToolContextStore/T3TeamThreadToolContextStore") {}

const createT3TeamThreadToolContextStore = Effect.fn("createT3TeamThreadToolContextStore")(() => {
  const contexts = new Map<ThreadId, T3TeamTurnToolContext>();
  // Process-local, like `contexts`: a server restart drops published views until the view next changes.
  const viewContexts = new Map<ThreadId, T3TeamStoredViewContext>();

  const get: T3TeamThreadToolContextStoreShape["get"] = (threadId) =>
    Effect.sync(() => contexts.get(threadId));

  const put: T3TeamThreadToolContextStoreShape["put"] = ({ threadId, toolContext }) =>
    Effect.sync(() => {
      if (toolContext) {
        contexts.set(threadId, toolContext);
        return;
      }

      contexts.delete(threadId);
    });

  const getViewContext: T3TeamThreadToolContextStoreShape["getViewContext"] = (threadId) =>
    Effect.sync(() => viewContexts.get(threadId));

  const putViewContext: T3TeamThreadToolContextStoreShape["putViewContext"] = ({
    threadId,
    viewContext,
    nowMs,
  }) =>
    Effect.sync(() => {
      if (viewContext) {
        viewContexts.set(threadId, { viewContext, publishedAtMs: nowMs });
        return;
      }

      viewContexts.delete(threadId);
    });

  return Effect.succeed({
    get,
    put,
    getViewContext,
    putViewContext,
  } satisfies T3TeamThreadToolContextStoreShape);
});

export const T3TeamThreadToolContextStoreLive = Layer.effect(
  T3TeamThreadToolContextStore,
  createT3TeamThreadToolContextStore(),
);
