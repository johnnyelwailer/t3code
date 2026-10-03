/**
 * Keeps the in-memory thread tool-context cache (t3team-threadToolContextStore.ts)
 * in step with the V2 thread lifecycle:
 *
 * - `thread.deleted` evicts the thread's entry. Without this the store's Map
 *   only ever grows: its sole other delete path is a client PUT with
 *   `toolContext: null`.
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

type ToolContextLifecycleEvent = Extract<
  OrchestrationV2DomainEvent,
  { readonly type: "thread.created" | "thread.deleted" }
>;

const isToolContextLifecycleEvent = (
  event: OrchestrationV2DomainEvent,
): event is ToolContextLifecycleEvent =>
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

  const apply = (event: ToolContextLifecycleEvent) => {
    if (event.type === "thread.deleted") {
      return store.put({ threadId: event.threadId, toolContext: null });
    }
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

  const handle = (event: ToolContextLifecycleEvent) =>
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

export const T3TeamThreadToolContextEvictionReactorLive = Layer.effect(
  T3TeamThreadToolContextEvictionReactor,
  make,
);
