import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import {
  awaitEarlierRunReactions,
  createThread,
  finalize,
  finishTurn,
  layerTest,
  runStatuses,
  send,
  settleAndAwaitQueueStart,
  stop,
  threadProjection,
  unsnapshottableCwd,
} from "./testkit/t3team-waitingRunFixtures.ts";

const stopMarkerCount = (threadId: ThreadId) =>
  threadProjection(threadId).pipe(
    Effect.map(
      (projection) =>
        projection.turnItems.filter((item) => item.type === "run_interrupt_request").length,
    ),
  );

it.effect.each([
  [true, true],
  [false, false],
  [false, true],
  [true, false],
] as const)("Stop twice on a waiting run succeeds, holdQueue=%s then %s", ([first, second]) =>
  Effect.gen(function* () {
    const threadId = ThreadId.make(`thread:waiting-stop:${first}:${second}`);
    yield* createThread(threadId);
    yield* send(threadId, "work", "start_immediately");
    const { runId } = yield* finishTurn(threadId);
    yield* send(threadId, "next", "queue_after_active");

    // The second click finds the run already reached and only adds what its own Stop holds.
    yield* stop({ threadId, runId, holdQueue: first, click: 1 });
    yield* stop({ threadId, runId, holdQueue: second, click: 2 });

    // The capture still settles the run; a full Stop holds what was queued behind it.
    assert.deepEqual(yield* runStatuses(threadId), [
      "waiting",
      first || second ? "queued:held" : "queued",
    ]);
    assert.equal(yield* stopMarkerCount(threadId), 1);
  }).pipe(Effect.provide(layerTest)),
);

it.effect(
  "Stop between capture retries, then a final failure, completes the run and starts the queue",
  () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread:waiting-stop-mid-retry");
      yield* createThread(threadId);
      yield* send(threadId, "work", "start_immediately");
      const target = yield* finishTurn(threadId, unsnapshottableCwd);
      yield* send(threadId, "next", "queue_after_active");
      assert.isTrue(Exit.isFailure(yield* finalize(threadId, target, true)));

      yield* stop({ threadId, runId: target.runId, holdQueue: false, click: 1 });
      assert.deepEqual(yield* runStatuses(threadId), ["waiting", "queued"]);
      assert.equal(yield* stopMarkerCount(threadId), 1);

      yield* settleAndAwaitQueueStart(threadId, finalize(threadId, target, false));
      const [first, next] = (yield* threadProjection(threadId)).runs;
      assert.equal(first?.status, "completed");
      assert.notEqual(next?.status, "queued");
    }).pipe(Effect.provide(layerTest)),
);

it.effect("a full Stop keeps the queue held when the run's capture then fails for good", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread:waiting-stop-held");
    yield* createThread(threadId);
    yield* send(threadId, "work", "start_immediately");
    const target = yield* finishTurn(threadId, unsnapshottableCwd);
    yield* send(threadId, "next", "queue_after_active");
    yield* stop({ threadId, runId: target.runId, holdQueue: true, click: 1 });

    assert.isTrue(Exit.isFailure(yield* finalize(threadId, target, false)));
    yield* awaitEarlierRunReactions("waiting-stop-held");

    assert.deepEqual(yield* runStatuses(threadId), ["completed", "queued:held"]);
  }).pipe(Effect.provide(layerTest)),
);
