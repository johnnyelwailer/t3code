import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import {
  T3TeamThreadToolContextEvictionReactor,
  T3TeamThreadToolContextEvictionReactorLive,
} from "./t3team-threadToolContextEvictionReactor.ts";

const makeTestLayer = (
  fakeEngine: OrchestrationEngineShape,
  putCalls: Array<{ threadId: ThreadId; toolContext?: unknown }>,
) =>
  T3TeamThreadToolContextEvictionReactorLive.pipe(
    Layer.provideMerge(Layer.succeed(OrchestrationEngineService, fakeEngine)),
    Layer.provideMerge(
      Layer.succeed(T3TeamThreadToolContextStore, {
        get: () => Effect.succeed(undefined),
        put: (input) =>
          Effect.sync(() => {
            putCalls.push(input);
          }),
      }),
    ),
  );

const runReactor = () =>
  Effect.gen(function* () {
    const reactor = yield* T3TeamThreadToolContextEvictionReactor;
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* reactor.start();
        yield* TestClock.adjust("10 millis");
        yield* reactor.drain;
      }),
    );
  });

describe("T3TeamThreadToolContextEvictionReactorLive", () => {
  it.effect("evicts the thread tool context store entry on thread.deleted", () => {
    const threadId = ThreadId.make("thread-tool-context-eviction-test");
    const putCalls: Array<{ threadId: ThreadId; toolContext?: unknown }> = [];
    const fakeEngine: OrchestrationEngineShape = {
      streamDomainEvents: Stream.make({
        type: "thread.deleted" as const,
        payload: { threadId },
      }) as never,
    } as unknown as OrchestrationEngineShape;

    return runReactor().pipe(
      Effect.map(() => {
        expect(putCalls).toContainEqual({ threadId, toolContext: null });
      }),
      Effect.provide(makeTestLayer(fakeEngine, putCalls)),
    );
  });

  it.effect("ignores non-deletion events", () => {
    const putCalls: Array<{ threadId: ThreadId; toolContext?: unknown }> = [];
    const fakeEngine: OrchestrationEngineShape = {
      streamDomainEvents: Stream.make({
        type: "thread.created" as const,
        payload: {},
      }) as never,
    } as unknown as OrchestrationEngineShape;

    return runReactor().pipe(
      Effect.map(() => {
        expect(putCalls).toHaveLength(0);
      }),
      Effect.provide(makeTestLayer(fakeEngine, putCalls)),
    );
  });
});
