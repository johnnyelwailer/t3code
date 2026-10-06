import { ThreadId, type OrchestrationV2DomainEvent } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import {
  ThreadManagementService,
  type ThreadManagementServiceShape,
} from "./orchestration-v2/ThreadManagementService.ts";
import type { T3TeamTurnToolContext } from "./t3team-toolBroker.ts";
import {
  T3TeamThreadToolContextStore,
  T3TeamThreadToolContextStoreLive,
} from "./t3team-threadToolContextStore.ts";
import {
  T3TeamThreadToolContextEvictionReactor,
  T3TeamThreadToolContextEvictionReactorLayer,
} from "./t3team-threadToolContextEvictionReactor.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import * as ThreadArtifactsStore from "./t3team-v2/t3team-threadArtifactsStore.ts";
import * as ThreadFactsStore from "./t3team-v2/t3team-threadFactsStore.ts";

const source = ThreadId.make("thread-source");
const fork = ThreadId.make("thread-fork");
const context = { workItem: { id: "TICKET-1" } } as unknown as T3TeamTurnToolContext;

const created = (
  threadId: ThreadId,
  relationshipToParent: "fork" | "subagent" | null,
  parentThreadId: ThreadId | null,
) =>
  ({
    type: "thread.created",
    threadId,
    payload: {
      id: threadId,
      lineage: { parentThreadId, relationshipToParent, rootThreadId: source },
    },
  }) as unknown as OrchestrationV2DomainEvent;

const deleted = (threadId: ThreadId) =>
  ({
    type: "thread.deleted",
    threadId,
    payload: { id: threadId },
  }) as unknown as OrchestrationV2DomainEvent;

const runWith = (
  events: ReadonlyArray<OrchestrationV2DomainEvent>,
  seed: ReadonlyArray<readonly [ThreadId, T3TeamTurnToolContext]>,
) =>
  Effect.gen(function* () {
    const store = yield* T3TeamThreadToolContextStore;
    const facts = yield* ThreadFactsStore.T3TeamThreadFactsStore;
    const artifacts = yield* ThreadArtifactsStore.T3TeamThreadArtifactsStore;
    for (const [threadId, toolContext] of seed) {
      yield* store.put({ threadId, toolContext });
      yield* facts.upsert(threadId, { retention: "ephemeral" });
      yield* artifacts.upsert({ id: `widget:${threadId}`, threadId, kind: "widget", payload: {} });
    }
    const reactor = yield* T3TeamThreadToolContextEvictionReactor;
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* reactor.start();
        yield* TestClock.adjust("10 millis");
        yield* reactor.drain;
      }),
    );
    return {
      source: yield* store.get(source),
      fork: yield* store.get(fork),
      sourceFacts: yield* facts.get(source),
      sourceArtifacts: yield* artifacts.listByThread(source),
      forkFacts: yield* facts.get(fork),
    };
  }).pipe(
    Effect.provide(
      T3TeamThreadToolContextEvictionReactorLayer.pipe(
        Layer.provideMerge(T3TeamThreadToolContextStoreLive),
        Layer.provideMerge(Layer.mergeAll(ThreadFactsStore.layer, ThreadArtifactsStore.layer)),
        Layer.provide(SqlitePersistenceMemory),
        Layer.provide(
          Layer.succeed(ThreadManagementService, {
            streamDomainEvents: Stream.fromIterable(events),
          } as unknown as ThreadManagementServiceShape),
        ),
      ),
    ),
  );

describe("T3TeamThreadToolContextEvictionReactorLayer", () => {
  it.effect("evicts the thread's entry, facts and artifacts on thread.deleted", () =>
    runWith(
      [deleted(source)],
      [
        [source, context],
        [fork, context],
      ],
    ).pipe(
      Effect.map((result) => {
        expect(result.source).toBeUndefined();
        expect(result.sourceFacts).toBeNull();
        expect(result.sourceArtifacts).toEqual([]);
        // Other threads keep theirs.
        expect(result.forkFacts?.retention).toBe("ephemeral");
      }),
    ),
  );

  it.effect("copies the source context onto a fork created by thread.fork", () =>
    runWith([created(fork, "fork", source)], [[source, context]]).pipe(
      Effect.map((result) => {
        expect(result.fork).toEqual(context);
        expect(result.source).toEqual(context);
      }),
    ),
  );

  it.effect("does not copy onto subagent children or unrelated threads", () =>
    runWith(
      [created(fork, "subagent", source), created(ThreadId.make("other"), null, null)],
      [[source, context]],
    ).pipe(Effect.map((result) => expect(result.fork).toBeUndefined())),
  );

  it.effect("keeps a context the fork already has", () => {
    const own = { workItem: { id: "TICKET-2" } } as unknown as T3TeamTurnToolContext;
    return runWith(
      [created(fork, "fork", source)],
      [
        [source, context],
        [fork, own],
      ],
    ).pipe(Effect.map((result) => expect(result.fork).toEqual(own)));
  });
});
