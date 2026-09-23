import { EnvironmentId, WS_METHODS } from "@t3tools/contracts";
import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Latch from "effect/Latch";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as Stream from "effect/Stream";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type * as RpcSession from "../rpc/session.ts";
import { createCloudSessionAtoms } from "./t3team-cloudSessions.ts";

const CLOUD_ENVIRONMENT = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("cloud-environment"),
  label: "Cloud environment",
  httpBaseUrl: "https://cloud.example.test",
  wsBaseUrl: "wss://cloud.example.test",
});

const cloudConnectionState = (): SupervisorConnectionState => ({
  ...AVAILABLE_CONNECTION_STATE,
  desired: true,
  network: "online",
  phase: "connected",
  attempt: 1,
  generation: 1,
});

// Let a real macrotask turn pass (setImmediate is not faked by the timer set
// below), so any refresh scheduled by a timer has run far enough to have
// called the RPC — which is exactly what we assert against.
const drainMacrotasks = Effect.promise(
  () =>
    new Promise<void>((resolve) => {
      const setImmediateFn = (
        globalThis as { readonly setImmediate?: (callback: () => void) => unknown }
      ).setImmediate;
      if (setImmediateFn === undefined) {
        throw new Error("setImmediate is unavailable in this environment.");
      }
      setImmediateFn(resolve);
    }),
);

const makeCloudSessionHarness = Effect.fn("TestCloudSessions.makeHarness")(function* () {
  const supervisorState = yield* SubscriptionRef.make(cloudConnectionState());
  const firstRpcStarted = Latch.makeUnsafe();
  const rpcMethodCalls: string[] = [];
  // Only the list method is exercised: it is the one that used to carry the
  // 5-second refresh interval.
  const client: Record<string, (input: unknown) => Effect.Effect<unknown, never>> = {
    [WS_METHODS.cloudSessionList]: () => {
      rpcMethodCalls.push(WS_METHODS.cloudSessionList);
      firstRpcStarted.openUnsafe();
      return Effect.succeed({ sessions: [], configured: true });
    },
  };
  const supervisorSession = yield* SubscriptionRef.make(
    Option.some({ client } as unknown as RpcSession.RpcSession),
  );
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: CLOUD_ENVIRONMENT,
    state: supervisorState,
    session: supervisorSession,
    prepared: yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none()),
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
  const run: EnvironmentRegistry.EnvironmentRegistry["Service"]["run"] = (
    _environmentId,
    effect,
  ) => Effect.provideService(effect, EnvironmentSupervisor.EnvironmentSupervisor, supervisor);
  const followStream: EnvironmentRegistry.EnvironmentRegistry["Service"]["followStream"] = (
    _environmentId,
    stream,
  ) => Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor);
  const environmentRegistry = EnvironmentRegistry.EnvironmentRegistry.of({
    run,
    followStream,
    stateChanges: () => SubscriptionRef.changes(supervisorState),
  } as unknown as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  const runtime = Atom.runtime(
    Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, environmentRegistry),
  );

  return { runtime, rpcMethodCalls, firstRpcStarted };
});

describe("cloud session atoms", () => {
  it.effect(
    "does not re-poll the session list on a timer while it stays subscribed",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
          try {
            const harness = yield* makeCloudSessionHarness();
            const atoms = createCloudSessionAtoms(harness.runtime);
            const registry = AtomRegistry.make();
            const unmount = registry.mount(
              atoms.list({ environmentId: CLOUD_ENVIRONMENT.environmentId, input: {} }),
            );
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                unmount();
                registry.dispose();
              }),
            );

            yield* harness.firstRpcStarted.await;
            // Far longer than the old 5s interval: with the timer removed, the
            // one mount-time RPC is the only RPC a subscribed list ever sends.
            vi.advanceTimersByTime(60_000);
            for (let i = 0; i < 5; i += 1) yield* drainMacrotasks;

            expect(harness.rpcMethodCalls).toEqual([WS_METHODS.cloudSessionList]);
          } finally {
            vi.useRealTimers();
          }
        }),
      ),
  );
});
