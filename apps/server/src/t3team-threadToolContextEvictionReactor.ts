/**
 * Keeps the fork's per-thread state in step with the V2 thread lifecycle:
 *
 * - `thread.deleted` evicts the thread's tool-context entry
 *   (t3team-threadToolContextStore.ts) and removes its thread facts and
 *   artifacts. Without this the in-memory Map and both side tables only ever
 *   grow (V2 deletion is final), and every client's all-threads facts
 *   snapshot carries the deleted threads.
 * - `thread.created` for a FORK (`lineage.relationshipToParent === "fork"`,
 *   upstream `thread.fork`) copies the source thread's tool context, so the
 *   fork keeps the work-item / backlog binding its source had. Delegated
 *   children get theirs from the delegate_task preparation instead.
 *
 * Live-tail only (`streamDomainEvents`): the store itself is process-local, so
 * there is nothing to catch up on after a restart.
 */
import type { OrchestrationV2DomainEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import { T3TeamV2FoundationLive } from "./t3team-v2/t3team-v2FoundationLive.ts";

const isToolContextLifecycleEvent = (event: OrchestrationV2DomainEvent) =>
  event.type === "thread.created" || event.type === "thread.deleted";

export interface T3TeamThreadToolContextEvictionReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  /** Resolves when the internal queue is idle. Intended for tests. */
  readonly drain: Effect.Effect<void>;
}

export class T3TeamThreadToolContextEvictionReactor extends Context.Service<
  T3TeamThreadToolContextEvictionReactor,
  T3TeamThreadToolContextEvictionReactorShape
>()("t3/t3team-threadToolContextEvictionReactor/T3TeamThreadToolContextEvictionReactor") {}

const make = Effect.gen(function* () {
  const threads = yield* ThreadManagementService;
  const store = yield* T3TeamThreadToolContextStore;
  const facts = yield* T3TeamThreadFactsStore;
  const artifacts = yield* T3TeamThreadArtifactsStore;

  const apply = (event: OrchestrationV2DomainEvent) => {
    if (event.type === "thread.deleted") {
      return Effect.all(
        [
          store.put({ threadId: event.threadId, toolContext: null }),
          facts.remove(event.threadId),
          artifacts.removeByThread(event.threadId),
        ],
        { discard: true },
      );
    }
    if (event.type !== "thread.created") return Effect.void;
    const lineage = event.payload.lineage;
    if (lineage.relationshipToParent !== "fork" || lineage.parentThreadId === null) {
      return Effect.void;
    }
    const sourceThreadId = lineage.parentThreadId;
    return Effect.gen(function* () {
      // Never overwrite a context the fork already received explicitly.
      if ((yield* store.get(event.threadId)) !== undefined) return;
      const source = yield* store.get(sourceThreadId);
      if (source === undefined) return;
      yield* store.put({ threadId: event.threadId, toolContext: source });
    });
  };

  const handle = (event: OrchestrationV2DomainEvent) =>
    apply(event).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("t3team thread tool context lifecycle update failed", {
              threadId: event.threadId,
              eventType: event.type,
              cause: Cause.pretty(cause),
            }),
      ),
    );

  const worker = yield* makeDrainableWorker(handle);

  const start: T3TeamThreadToolContextEvictionReactorShape["start"] = Effect.fn("start")(
    function* () {
      yield* Effect.forkScoped(
        Stream.runForEach(threads.streamDomainEvents, (event) =>
          isToolContextLifecycleEvent(event) ? worker.enqueue(event) : Effect.void,
        ),
      );
    },
  );

  return { start, drain: worker.drain } satisfies T3TeamThreadToolContextEvictionReactorShape;
});

/** Over whichever facts/artifacts stores the caller provides (tests). */
export const T3TeamThreadToolContextEvictionReactorLayer = Layer.effect(
  T3TeamThreadToolContextEvictionReactor,
  make,
);

/** Production: over the runtime's ONE facts/artifacts stores (same layer reference, memoized). */
export const T3TeamThreadToolContextEvictionReactorLive =
  T3TeamThreadToolContextEvictionReactorLayer.pipe(Layer.provide(T3TeamV2FoundationLive));
