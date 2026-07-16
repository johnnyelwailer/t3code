/**
 * Evicts a thread's cached tool-context payload (t3work-threadToolContextStore.ts)
 * once the thread is deleted. Modeled on the upstream
 * `orchestration/Layers/ThreadDeletionReactor.ts` cleanup pattern, kept as a
 * separate t3work-* reactor (rather than editing the upstream file directly)
 * so upstream merges don't have to reconcile fork-specific cleanup logic
 * inline in that file.
 *
 * Without this, `T3workThreadToolContextStore`'s in-memory Map only ever grows:
 * its sole delete path is a client PUT with `toolContext: null`, which nothing
 * calls today.
 */
import type { OrchestrationEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { T3workThreadToolContextStore } from "./t3work-threadToolContextStore.ts";

type ThreadDeletedEvent = Extract<OrchestrationEvent, { type: "thread.deleted" }>;

export interface T3workThreadToolContextEvictionReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  /** Resolves when the internal queue is idle. Intended for tests. */
  readonly drain: Effect.Effect<void>;
}

export class T3workThreadToolContextEvictionReactor extends Context.Service<
  T3workThreadToolContextEvictionReactor,
  T3workThreadToolContextEvictionReactorShape
>()("t3/t3work-threadToolContextEvictionReactor/T3workThreadToolContextEvictionReactor") {}

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const store = yield* T3workThreadToolContextStore;

  const evict = (event: ThreadDeletedEvent) =>
    store.put({ threadId: event.payload.threadId, toolContext: null }).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }
        return Effect.logWarning("t3work thread tool context eviction failed", {
          threadId: event.payload.threadId,
          cause: Cause.pretty(cause),
        });
      }),
    );

  const worker = yield* makeDrainableWorker(evict);

  const start: T3workThreadToolContextEvictionReactorShape["start"] = Effect.fn("start")(
    function* () {
      yield* Effect.forkScoped(
        Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
          if (event.type !== "thread.deleted") {
            return Effect.void;
          }
          return worker.enqueue(event);
        }),
      );
    },
  );

  return {
    start,
    drain: worker.drain,
  } satisfies T3workThreadToolContextEvictionReactorShape;
});

export const T3workThreadToolContextEvictionReactorLive = Layer.effect(
  T3workThreadToolContextEvictionReactor,
  make,
);
