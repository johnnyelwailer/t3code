// New sibling test file (rather than extending client.test.ts) so this
// change stays additive: client.test.ts is an upstream-tracked file, and the
// additive guard whitelist for this change intentionally only adds
// packages/client-runtime/src/state/threads.ts. The harness below mirrors
// (duplicates, deliberately) the one in client.test.ts.
import { EnvironmentId, WS_METHODS } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as TestClock from "effect/testing/TestClock";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import * as RpcSession from "../rpc/session.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import { subscribe } from "./client.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});

function session(client: WsRpcProtocolClient): RpcSession.RpcSession {
  return {
    client,
    initialConfig: Effect.never,
    subscribeServerConfig: () => Stream.empty,
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
}

const makeHarness = Effect.fn("TestEnvironmentRpc.terminalFailure.makeHarness")(function* () {
  const state = yield* SubscriptionRef.make<SupervisorConnectionState>(AVAILABLE_CONNECTION_STATE);
  const activeSession = yield* SubscriptionRef.make<Option.Option<RpcSession.RpcSession>>(
    Option.none(),
  );
  const prepared = yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none());
  const retryCount = yield* Ref.make(0);
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: TARGET,
    state,
    session: activeSession,
    prepared,
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Ref.update(retryCount, (count) => count + 1),
  } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
  return {
    activeSession,
    retryCount,
    supervisor,
  };
});

describe("environment RPC terminal failure classification", () => {
  it.effect("ends the stream on a terminal failure instead of retrying", () =>
    Effect.gen(function* () {
      const domainError = new Error("thread not found");
      const subscriptionCount = yield* Ref.make(0);
      const expectedFailureCount = yield* Ref.make(0);
      const client = {
        [WS_METHODS.subscribeTerminalEvents]: () =>
          Stream.unwrap(
            Ref.updateAndGet(subscriptionCount, (count) => count + 1).pipe(
              Effect.map(() => Stream.fail(domainError)),
            ),
          ),
      } as unknown as WsRpcProtocolClient;
      const { activeSession, supervisor } = yield* makeHarness();

      yield* SubscriptionRef.set(activeSession, Option.some(session(client)));
      const subscriptionFiber = yield* subscribe(
        WS_METHODS.subscribeTerminalEvents,
        {},
        {
          onExpectedFailure: () => Ref.update(expectedFailureCount, (count) => count + 1),
          retryExpectedFailureAfter: "250 millis",
          isTerminalFailure: () => true,
        },
      ).pipe(
        Stream.runDrain,
        Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
        Effect.forkChild,
      );
      for (
        let attempt = 0;
        attempt < 100 && (yield* Ref.get(expectedFailureCount)) < 1;
        attempt += 1
      ) {
        yield* Effect.yieldNow;
      }

      expect(yield* Ref.get(subscriptionCount)).toBe(1);
      expect(yield* Ref.get(expectedFailureCount)).toBe(1);

      // Advancing the clock far past the configured retry delay must not
      // trigger a resubscribe: the terminal path already ended the inner
      // stream without sleeping or resubscribing.
      yield* TestClock.adjust("10 seconds");
      yield* Effect.yieldNow;
      expect(yield* Ref.get(subscriptionCount)).toBe(1);

      yield* Fiber.interrupt(subscriptionFiber);
    }),
  );

  it.effect("keeps retrying a non-terminal failure unchanged", () =>
    Effect.gen(function* () {
      const domainError = new Error("transient failure");
      const subscriptionCount = yield* Ref.make(0);
      const expectedFailureCount = yield* Ref.make(0);
      const client = {
        [WS_METHODS.subscribeTerminalEvents]: () =>
          Stream.unwrap(
            Ref.getAndUpdate(subscriptionCount, (count) => count + 1).pipe(
              Effect.map((count) => (count === 0 ? Stream.fail(domainError) : Stream.never)),
            ),
          ),
      } as unknown as WsRpcProtocolClient;
      const { activeSession, supervisor } = yield* makeHarness();

      yield* SubscriptionRef.set(activeSession, Option.some(session(client)));
      const subscriptionFiber = yield* subscribe(
        WS_METHODS.subscribeTerminalEvents,
        {},
        {
          onExpectedFailure: () => Ref.update(expectedFailureCount, (count) => count + 1),
          retryExpectedFailureAfter: "100 millis",
          isTerminalFailure: () => false,
        },
      ).pipe(
        Stream.runDrain,
        Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
        Effect.forkChild,
      );
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(expectedFailureCount)) >= 1) {
          break;
        }
        yield* Effect.yieldNow;
      }

      expect(yield* Ref.get(subscriptionCount)).toBe(1);

      yield* TestClock.adjust("100 millis");
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(subscriptionCount)) >= 2) {
          break;
        }
        yield* Effect.yieldNow;
      }
      yield* Fiber.interrupt(subscriptionFiber);

      expect(yield* Ref.get(subscriptionCount)).toBe(2);
      expect(yield* Ref.get(expectedFailureCount)).toBe(1);
    }),
  );

  it.effect(
    "gives exactly one further attempt after a terminal failure when a new session arrives",
    () =>
      Effect.gen(function* () {
        const domainError = new Error("thread not found");
        const subscriptions: Array<string> = [];
        const expectedFailureCount = yield* Ref.make(0);
        const firstClient = {
          [WS_METHODS.subscribeTerminalEvents]: () => {
            subscriptions.push("first");
            return Stream.fail(domainError);
          },
        } as unknown as WsRpcProtocolClient;
        const secondClient = {
          [WS_METHODS.subscribeTerminalEvents]: () => {
            subscriptions.push("second");
            return Stream.never;
          },
        } as unknown as WsRpcProtocolClient;
        const { activeSession, supervisor } = yield* makeHarness();

        yield* SubscriptionRef.set(activeSession, Option.some(session(firstClient)));
        const subscriptionFiber = yield* subscribe(
          WS_METHODS.subscribeTerminalEvents,
          {},
          {
            onExpectedFailure: () => Ref.update(expectedFailureCount, (count) => count + 1),
            retryExpectedFailureAfter: "250 millis",
            isTerminalFailure: () => true,
          },
        ).pipe(
          Stream.runDrain,
          Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
          Effect.forkChild,
        );
        for (let attempt = 0; attempt < 100 && subscriptions.length < 1; attempt += 1) {
          yield* Effect.yieldNow;
        }
        expect(subscriptions).toEqual(["first"]);

        yield* TestClock.adjust("10 seconds");
        yield* Effect.yieldNow;
        expect(subscriptions).toEqual(["first"]);

        yield* SubscriptionRef.set(activeSession, Option.some(session(secondClient)));
        for (let attempt = 0; attempt < 100 && subscriptions.length < 2; attempt += 1) {
          yield* Effect.yieldNow;
        }
        yield* Fiber.interrupt(subscriptionFiber);

        expect(subscriptions).toEqual(["first", "second"]);
        expect(yield* Ref.get(expectedFailureCount)).toBe(1);
      }),
  );
});
