import { EnvironmentId, ORCHESTRATION_WS_METHODS } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { subscribeDynamic } from "./client.ts";
import { createThreadResubscribeGate, type ThreadResubscribeGate } from "./t3team-threadResubscribeGate.ts";
import type { WsRpcProtocolClient } from "./protocol.ts";
import type { RpcSession } from "./session.ts";

/**
 * GHE #382 storm — seam D.
 *
 * A session replacement used to reopen every live thread stream in the same
 * tick; on the live machine that is ~788 `subscribeThread` snapshot loads at
 * once, which starves the liveness probe and keeps the disconnect loop
 * self-sustaining. These tests pin the replacement: a resubscribe burst is
 * bounded (a fixed number of streams go out immediately) and staggered (the
 * rest land at increasing delays), the burst counter restarts per session,
 * and the streams themselves keep delivering updates after the session
 * change.
 */

const B = { maxImmediate: 4, stepMs: 10, decayMs: 1_000 };

describe("thread resubscribe gate (GHE #382)", () => {
  it("spreads a resubscribe burst: immediate slots first, then increasing steps", () => {
    const now = { value: 0 };
    const gate = createThreadResubscribeGate(B);
    const session = {};

    const delays: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      delays.push(gate.allocateDelayMs(session, now.value));
    }

    // The first `maxImmediate` streams of the burst go out immediately...
    expect(delays.filter((delay) => delay === 0).length).toBe(B.maxImmediate);
    // ...and the rest land at strictly increasing, bounded steps.
    expect(delays.slice(B.maxImmediate)).toEqual(
      Array.from({ length: 16 }, (_, index) => (index + 1) * B.stepMs),
    );
  });

  it("restarts the burst counter after the decay window", () => {
    const now = { value: 0 };
    const gate = createThreadResubscribeGate(B);
    const session = {};

    for (let index = 0; index < 5; index += 1) gate.allocateDelayMs(session, now.value);
    expect(gate.allocateDelayMs(session, now.value)).toBe(20);

    now.value += B.decayMs + 1;
    expect(gate.allocateDelayMs(session, now.value)).toBe(0);
  });

  it("keeps separate bursts (sessions) independent", () => {
    const gate = createThreadResubscribeGate(B);
    const sessionA = {};
    const sessionB = {};

    for (let index = 0; index < 6; index += 1) gate.allocateDelayMs(sessionA, 0);
    expect(gate.allocateDelayMs(sessionB, 0)).toBe(0);
    expect(gate.allocateDelayMs(sessionA, 0)).toBe(30);
  });
});

const STREAM_COUNT = 12;

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("stagger-environment"),
  label: "Stagger environment",
  httpBaseUrl: "https://stagger.example.test",
  wsBaseUrl: "wss://stagger.example.test",
});

function session(client: WsRpcProtocolClient): RpcSession {
  return {
    client,
    initialConfig: Effect.never,
    subscribeServerConfig: (input) => client.subscribeServerConfig(input),
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
}

const makeHarness = Effect.fn("ThreadResubscribeGateTest.makeHarness")(function* () {
  const state = yield* SubscriptionRef.make<SupervisorConnectionState>(AVAILABLE_CONNECTION_STATE);
  const activeSession = yield* SubscriptionRef.make<Option.Option<RpcSession>>(Option.none());
  const prepared = yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none());
  const supervisor = EnvironmentSupervisor.of({
    target: TARGET,
    state,
    session: activeSession,
    prepared,
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  } satisfies EnvironmentSupervisor["Service"]);
  return { activeSession, supervisor };
});

const PHASE_A = Array.from({ length: STREAM_COUNT }, (_, index) => `a-${index}`);
const PHASE_B = Array.from({ length: STREAM_COUNT }, (_, index) => `b-${index}`);

describe("staggered resubscribe wiring (GHE #382)", () => {
  it.effect("a session change never opens all streams in one tick, and streams keep updating", () =>
    Effect.gen(function* () {
      const gate: ThreadResubscribeGate = createThreadResubscribeGate(B);
      const { activeSession, supervisor } = yield* makeHarness();
      // Each consumer gets its own value channel: in this Effect version a
      // `Stream.fromQueue` holds the queue's read handle exclusively, and
      // per-stream channels also mirror the real shape (788 distinct
      // server-side subscriptions, one per thread stream).
      const makeQueues = Effect.fn("ThreadResubscribeGateTest.makeQueues")(function* () {
        const queues: Array<Queue.Queue<string, never>> = [];
        for (let index = 0; index < STREAM_COUNT; index += 1) {
          queues.push(yield* Queue.unbounded<string>());
        }
        return queues;
      });
      const queuesA = yield* makeQueues();
      const queuesB = yield* makeQueues();
      // Each consumer's client method is called once per session phase; the
      // call order within a phase is the consumer order, so rotate through
      // the phase's queue list.
      let callIndex = 0;
      const client = {
        [ORCHESTRATION_WS_METHODS.subscribeThread]: () => {
          const index = callIndex;
          callIndex += 1;
          return Stream.fromQueue(
            index < STREAM_COUNT ? queuesA[index]! : queuesB[index - STREAM_COUNT]!,
          );
        },
      } as unknown as WsRpcProtocolClient;
      const sessionA = session(client);
      const sessionB = session(client);

      const delays: number[] = [];
      const receivedCount = yield* Ref.make(0);

      const streams = Array.from({ length: STREAM_COUNT }, () =>
        subscribeDynamic(
          ORCHESTRATION_WS_METHODS.subscribeThread,
          () => Effect.succeed({} as never),
          {
            // Same shape the thread-state wiring uses: take a slot in the
            // shared gate on every (re)subscribe.
            beforeSubscribe: (activeSession) =>
              Effect.sync(() => {
                delays.push(gate.allocateDelayMs(activeSession, 0));
              }),
          },
        ),
      );
      // `Effect.all` is sequential by default in this Effect version: the
      // consumers must run concurrently or the first stream (blocked on its
      // queue value) would hold the others back.
      const consumers = yield* Effect.all(
        streams.map((stream) =>
          stream.pipe(
            Stream.take(2),
            Stream.runForEach(() => Ref.update(receivedCount, (count) => count + 1)),
            Effect.provideService(EnvironmentSupervisor, supervisor),
          ),
        ),
        { concurrency: "unbounded" },
      ).pipe(Effect.forkChild);

      const awaitAllocations = Effect.fn("ThreadResubscribeGateTest.awaitAllocations")(
        function* (count: number) {
          for (let attempt = 0; attempt < 20_000; attempt += 1) {
            if (delays.length >= count) return;
            yield* Effect.yieldNow;
          }
          return yield* Effect.die(
            new Error(`Expected ${count} beforeSubscribe allocations, saw ${delays.length}.`),
          );
        },
      );

      const awaitReceived = Effect.fn("ThreadResubscribeGateTest.awaitReceived")(function* (
        count: number,
      ) {
        for (let attempt = 0; attempt < 20_000; attempt += 1) {
          if ((yield* Ref.get(receivedCount)) >= count) return;
          yield* Effect.yieldNow;
        }
        return yield* Effect.die(
          new Error(`Expected ${count} received values, saw ${yield* Ref.get(receivedCount)}.`),
        );
      });

      // Phase 1: first session; every stream subscribes in one burst.
      yield* SubscriptionRef.set(activeSession, Option.some(sessionA));
      yield* awaitAllocations(STREAM_COUNT);
      for (let index = 0; index < STREAM_COUNT; index += 1) {
        yield* Queue.offer(queuesA[index]!, PHASE_A[index]!);
      }
      yield* awaitReceived(STREAM_COUNT);

      // Phase 2: the session is replaced; the same streams must resubscribe
      // as a fresh (bounded, staggered) burst and keep receiving updates.
      yield* SubscriptionRef.set(activeSession, Option.some(sessionB));
      yield* awaitAllocations(STREAM_COUNT * 2);
      for (let index = 0; index < STREAM_COUNT; index += 1) {
        yield* Queue.offer(queuesB[index]!, PHASE_B[index]!);
      }
      yield* awaitReceived(STREAM_COUNT * 2);

      yield* Fiber.interrupt(consumers);

      const firstBurst = [...delays.slice(0, STREAM_COUNT)].sort((a, b) => a - b);
      const secondBurst = [...delays.slice(STREAM_COUNT)].sort((a, b) => a - b);
      const expectedProfile = Array.from({ length: STREAM_COUNT }, (value, index) =>
        index < B.maxImmediate ? 0 : (index - B.maxImmediate + 1) * B.stepMs,
      );

      // At most `maxImmediate` streams of either burst go out immediately —
      // the burst is bounded, not all-at-once.
      expect(firstBurst).toEqual(expectedProfile);
      expect(secondBurst).toEqual(expectedProfile);
      // Every stream received one value from each session: the resubscribed
      // streams keep delivering updates.
      expect(yield* Ref.get(receivedCount)).toBe(STREAM_COUNT * 2);
    }),
  );
});
