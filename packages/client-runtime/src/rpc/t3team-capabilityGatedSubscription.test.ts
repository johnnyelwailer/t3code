import {
  EnvironmentId,
  ThreadId,
  WS_METHODS,
  type T3TeamEnvironmentCapabilities,
  type T3TeamThreadFactsStreamEvent,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import type { WsRpcProtocolClient } from "./protocol.ts";
import type { RpcSession } from "./session.ts";
import { subscribeWhenSupported } from "./t3team-capabilityGatedSubscription.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("capability-environment"),
  label: "Capability environment",
  httpBaseUrl: "https://capability.example.test",
  wsBaseUrl: "wss://capability.example.test",
});

const UNSUPPORTED: T3TeamThreadFactsStreamEvent = { type: "snapshot", facts: [] };
const LIVE: T3TeamThreadFactsStreamEvent = {
  type: "removed",
  threadId: ThreadId.make("thread-1"),
};

interface FakeServer {
  readonly session: RpcSession;
  readonly events: Queue.Queue<T3TeamThreadFactsStreamEvent>;
  readonly calls: () => number;
}

const fakeServer = Effect.fn("CapabilityGateTest.fakeServer")(function* (
  t3team: T3TeamEnvironmentCapabilities | undefined,
) {
  const events = yield* Queue.unbounded<T3TeamThreadFactsStreamEvent>();
  let calls = 0;
  const client = {
    [WS_METHODS.t3teamSubscribeThreadFacts]: () => {
      calls += 1;
      return Stream.fromQueue(events);
    },
  } as unknown as WsRpcProtocolClient;
  const session: RpcSession = {
    client,
    // Only the capability block matters to the gate.
    initialConfig: Effect.succeed({
      environment: { capabilities: t3team === undefined ? {} : { t3team } },
    } as never),
    subscribeServerConfig: () => Stream.empty,
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
  return { session, events, calls: () => calls } satisfies FakeServer;
});

const makeHarness = Effect.fn("CapabilityGateTest.makeHarness")(function* (initial: FakeServer) {
  const state = yield* SubscriptionRef.make<SupervisorConnectionState>(AVAILABLE_CONNECTION_STATE);
  const activeSession = yield* SubscriptionRef.make<Option.Option<RpcSession>>(
    Option.some(initial.session),
  );
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
  const observed = yield* Queue.unbounded<T3TeamThreadFactsStreamEvent>();
  const fiber = yield* subscribeWhenSupported(
    WS_METHODS.t3teamSubscribeThreadFacts,
    {},
    { supported: (capabilities) => capabilities?.threadFacts === true, unsupported: UNSUPPORTED },
  ).pipe(
    Stream.runForEach((event) => Queue.offer(observed, event)),
    Effect.provideService(EnvironmentSupervisor, supervisor),
    Effect.forkChild,
  );
  return { activeSession, observed, fiber };
});

describe("subscribeWhenSupported", () => {
  it.effect("settles on the unsupported value without calling a server that lacks the flag", () =>
    Effect.gen(function* () {
      const upstream = yield* fakeServer(undefined);
      const harness = yield* makeHarness(upstream);

      expect(yield* Queue.take(harness.observed)).toEqual(UNSUPPORTED);
      yield* Effect.yieldNow;
      expect(upstream.calls()).toBe(0);
      yield* Fiber.interrupt(harness.fiber);
    }),
  );

  it.effect("treats an explicitly disabled flag as unsupported", () =>
    Effect.gen(function* () {
      const server = yield* fakeServer({ threadFacts: false, threadArtifacts: true });
      const harness = yield* makeHarness(server);

      expect(yield* Queue.take(harness.observed)).toEqual(UNSUPPORTED);
      expect(server.calls()).toBe(0);
      yield* Fiber.interrupt(harness.fiber);
    }),
  );

  it.effect("streams the fork RPC from a server that advertises the flag", () =>
    Effect.gen(function* () {
      const server = yield* fakeServer({ threadFacts: true });
      const harness = yield* makeHarness(server);

      yield* Queue.offer(server.events, LIVE);
      expect(yield* Queue.take(harness.observed)).toEqual(LIVE);
      expect(server.calls()).toBe(1);
      yield* Fiber.interrupt(harness.fiber);
    }),
  );

  it.effect("drops to the unsupported value when the session moves to an older server", () =>
    Effect.gen(function* () {
      const capable = yield* fakeServer({ threadFacts: true });
      const older = yield* fakeServer(undefined);
      const harness = yield* makeHarness(capable);
      yield* Queue.offer(capable.events, LIVE);
      expect(yield* Queue.take(harness.observed)).toEqual(LIVE);

      yield* SubscriptionRef.set(harness.activeSession, Option.some(older.session));

      expect(yield* Queue.take(harness.observed)).toEqual(UNSUPPORTED);
      expect(older.calls()).toBe(0);
      expect(capable.calls()).toBe(1);

      // ...and resumes the fork stream once a capable server is back.
      yield* SubscriptionRef.set(harness.activeSession, Option.some(capable.session));
      yield* Queue.offer(capable.events, LIVE);
      expect(yield* Queue.take(harness.observed)).toEqual(LIVE);
      expect(capable.calls()).toBe(2);
      expect(older.calls()).toBe(0);
      yield* Fiber.interrupt(harness.fiber);
    }),
  );
});
