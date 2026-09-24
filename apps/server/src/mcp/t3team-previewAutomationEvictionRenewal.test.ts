// Sibling test file (rather than extending PreviewAutomationBroker.test.ts,
// an upstream-tracked file) so the change stays additive. The broker setup
// below mirrors the one in PreviewAutomationBroker.test.ts.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  PreviewAutomationNoAvailableHostError,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as PreviewAutomationBroker from "./PreviewAutomationBroker.ts";

const makeBroker = PreviewAutomationBroker.make.pipe(Effect.provide(NodeServices.layer));

const scope = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-1"),
  providerSessionId: "provider-session-1",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["preview"] as const),
  issuedAt: 1,
};

// The single desktop window: one stable clientId, no second host to fail over to.
const host = { clientId: "client-1", environmentId: scope.environmentId };

it.effect("serves the next call once the only evicted host re-registers", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const firstConnected = yield* Deferred.make<string>();
      const frozenRequest = yield* Deferred.make<void>();
      const firstConsumer = yield* Stream.runForEach(yield* broker.connect(host), (event) =>
        event.type === "connected"
          ? Deferred.succeed(firstConnected, event.connectionId)
          : Deferred.succeed(frozenRequest, undefined),
      ).pipe(Effect.forkScoped);
      const firstConnectionId = yield* Deferred.await(firstConnected);

      const timedOut = yield* broker
        .invoke<void>({ scope, operation: "snapshot", input: {}, timeoutMs: 1_000 })
        .pipe(Effect.flip, Effect.forkScoped);
      yield* Deferred.await(frozenRequest);
      yield* TestClock.adjust(1_000);
      expect(yield* Fiber.join(timedOut)).toMatchObject({ _tag: "PreviewAutomationTimeoutError" });

      // Eviction ends the stream with an interrupt: the shape the client
      // subscription must treat as "server ended, renew", not as terminal.
      const firstExit = yield* Fiber.await(firstConsumer);
      expect(Exit.isFailure(firstExit) && Cause.hasInterruptsOnly(firstExit.cause)).toBe(true);
      expect(
        yield* broker.invoke<void>({ scope, operation: "status", input: {} }).pipe(Effect.flip),
      ).toBeInstanceOf(PreviewAutomationNoAvailableHostError);

      // The same renderer resubscribes with its stable clientId.
      const renewedConnected = yield* Deferred.make<string>();
      yield* Stream.runForEach(yield* broker.connect(host), (event) => {
        if (event.type === "connected") {
          return Deferred.succeed(renewedConnected, event.connectionId);
        }
        return broker.respond({
          clientId: host.clientId,
          connectionId: event.connectionId,
          requestId: event.request.requestId,
          ok: true,
          result: "renewed",
        });
      }).pipe(Effect.forkScoped);
      const renewedConnectionId = yield* Deferred.await(renewedConnected);

      expect(renewedConnectionId).not.toBe(firstConnectionId);
      expect(yield* broker.invoke({ scope, operation: "status", input: {} })).toBe("renewed");
    }),
  ),
);
