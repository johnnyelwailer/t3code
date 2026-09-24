// Sibling test file (rather than extending preview.test.ts) so the change
// stays additive. It drives the production `automationRequests` atom family,
// so it pins the real subscription configuration, not a test-only copy.
import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId, type PreviewAutomationStreamEvent, WS_METHODS } from "@t3tools/contracts";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type * as RpcSession from "../rpc/session.ts";
import { createPreviewEnvironmentAtoms } from "./preview.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});

type HostQueue = Queue.Queue<PreviewAutomationStreamEvent, Cause.Done>;

// Mirrors the broker: every connect gets a fresh connectionId, announced
// first, and requests arrive on a queue the server may shut down.
const makeAutomationHarness = Effect.fn("TestPreviewAutomation.makeHarness")(function* () {
  const connections: Array<HostQueue> = [];
  const client = {
    [WS_METHODS.previewAutomationConnect]: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const queue = yield* Queue.unbounded<PreviewAutomationStreamEvent, Cause.Done>();
          connections.push(queue);
          yield* Queue.offer(queue, {
            type: "connected",
            connectionId: `connection-${connections.length}`,
          });
          return Stream.fromQueue(queue);
        }),
      ),
  } as unknown as WsRpcProtocolClient;
  const session: RpcSession.RpcSession = {
    client,
    initialConfig: Effect.never,
    subscribeServerConfig: () => Stream.empty,
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
  const supervisorState = yield* SubscriptionRef.make<SupervisorConnectionState>(
    AVAILABLE_CONNECTION_STATE,
  );
  const activeSession = yield* SubscriptionRef.make(Option.some(session));
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: TARGET,
    state: supervisorState,
    session: activeSession,
    prepared: yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none()),
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
  const followStream: EnvironmentRegistry.EnvironmentRegistry["Service"]["followStream"] = (
    _environmentId,
    stream,
  ) => Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor);
  const environmentRegistry = EnvironmentRegistry.EnvironmentRegistry.of({
    followStream,
    stateChanges: () => SubscriptionRef.changes(supervisorState),
  } as unknown as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  const runtime = Atom.runtime(
    Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, environmentRegistry),
  );
  const requestsAtom = createPreviewEnvironmentAtoms(runtime).automationRequests({
    environmentId: TARGET.environmentId,
    input: { clientId: "client-1", environmentId: TARGET.environmentId },
  });
  const registry = AtomRegistry.make();
  const unmount = registry.mount(requestsAtom);
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      unmount();
      registry.dispose();
    }),
  );
  const awaitConnection = Effect.fn("TestPreviewAutomation.awaitConnection")(function* (
    connectionId: string,
  ) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const result = registry.get(requestsAtom);
      if (AsyncResult.isSuccess(result) && result.value.connectionId === connectionId) return;
      yield* Effect.sleep("10 millis");
    }
    return yield* Effect.die(new Error(`never saw ${connectionId}`));
  });
  const replaceSession = SubscriptionRef.set(activeSession, Option.some({ ...session }));
  return { awaitConnection, connections, registry, replaceSession, requestsAtom, unmount };
});

describe("preview automation host registration", () => {
  it.live("re-registers after the broker evicts the host by shutting its stream down", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeAutomationHarness();
        yield* harness.awaitConnection("connection-1");

        // What the broker does when a request times out: the client sees an
        // interrupt-only failure, which used to end the subscription for good.
        yield* Queue.shutdown(harness.connections[0]!);

        yield* harness.awaitConnection("connection-2");
        expect(harness.connections).toHaveLength(2);
        expect(AsyncResult.isSuccess(harness.registry.get(harness.requestsAtom))).toBe(true);
      }),
    ),
  );

  it.live("does not renew a stream the client cancelled itself", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeAutomationHarness();
        yield* harness.awaitConnection("connection-1");

        // Local interruption (the switchMap / dispose path) is not a server end.
        harness.unmount();
        yield* Effect.sleep("600 millis");
        expect(harness.connections).toHaveLength(1);
      }),
    ),
  );

  it.live("does not renew on the old session when the session is replaced", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeAutomationHarness();
        yield* harness.awaitConnection("connection-1");

        // switchMap interrupts the old inner stream: exactly one new connect,
        // for the new session, and no zombie renewal of the old one.
        yield* harness.replaceSession;
        yield* harness.awaitConnection("connection-2");
        yield* Effect.sleep("600 millis");
        expect(harness.connections).toHaveLength(2);
      }),
    ),
  );

  it.live("re-registers after the server ends the stream cleanly", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeAutomationHarness();
        yield* harness.awaitConnection("connection-1");

        yield* Queue.end(harness.connections[0]!);

        yield* harness.awaitConnection("connection-2");
        expect(harness.connections).toHaveLength(2);
      }),
    ),
  );
});
