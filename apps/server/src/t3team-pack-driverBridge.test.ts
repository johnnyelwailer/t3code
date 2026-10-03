import { describe, expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProviderInstanceId,
  ProviderSessionId,
  ProviderThreadId,
  ThreadId,
} from "@t3tools/contracts";
import type { PackProviderDriverDefinition, PackSessionRuntime } from "@t3team/pack-api";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { clearMcpProviderSession, setMcpProviderSession } from "./mcp/McpProviderSession.ts";
import * as ProviderContinuationRequests from "./orchestration-v2/ProviderContinuationRequests.ts";
import { layerTest as serverSettingsLayerTest } from "./serverSettings.ts";
import {
  CAPABILITIES_JSON,
  makeScriptedPack,
  PACK_DRIVER,
  providerThreadJson,
} from "./t3team-pack-driver.fixtures.ts";
import { bridgePackProviderDriver } from "./t3team-pack-driverBridge.ts";

const instanceId = ProviderInstanceId.make(PACK_DRIVER);
const threadId = ThreadId.make("thread-1");
const providerSessionId = ProviderSessionId.make("provider-session-1");
const modelSelection = { instanceId, model: "example/model" };
const runtimePolicy = {
  runtimeMode: "full-access",
  interactionMode: "default",
  cwd: "/work",
} as const;

const createInScope = (definition: PackProviderDriverDefinition) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const instance = yield* bridgePackProviderDriver(definition)
      .create({ instanceId, displayName: "Example", environment: [], enabled: true, config: {} })
      .pipe(Effect.provideService(Scope.Scope, scope));
    return { scope, instance };
  });

const openSession = (definition: PackProviderDriverDefinition) =>
  Effect.gen(function* () {
    const { scope, instance } = yield* createInScope(definition);
    const sessionScope = yield* Scope.make();
    const runtime = yield* instance.orchestrationAdapter
      .openSession({ threadId, providerSessionId, modelSelection, runtimePolicy })
      .pipe(Effect.provideService(Scope.Scope, sessionScope));
    return { scope, sessionScope, instance, runtime };
  });

const withSession = (session: Partial<PackSessionRuntime>) =>
  makeScriptedPack({ session }).definition;

describe("bridgePackProviderDriver (orchestration V2)", () => {
  it.effect("maps the pack adapter and an open session one-to-one", () =>
    Effect.gen(function* () {
      const pack = makeScriptedPack();
      setMcpProviderSession({
        environmentId: EnvironmentId.make("environment-1"),
        threadId,
        providerSessionId,
        providerInstanceId: instanceId,
        browserToolsAvailable: false,
        endpoint: "http://127.0.0.1:3000/mcp",
        authorizationHeader: "Bearer provider-token",
      });
      const { instance, runtime, sessionScope, scope } = yield* openSession(pack.definition);
      clearMcpProviderSession(threadId);

      expect(instance.orchestrationAdapter.driver).toBe(PACK_DRIVER);
      const capabilities = yield* instance.orchestrationAdapter.getCapabilities();
      expect(capabilities.turns).toEqual((CAPABILITIES_JSON as { readonly turns: unknown }).turns);
      expect(
        yield* instance.orchestrationAdapter.planSelectionTransition({
          current: modelSelection,
          target: { ...modelSelection, model: "other" },
          sessionCapabilities: capabilities,
        }),
      ).toEqual({ type: "apply_on_next_turn" });

      const opened = pack.opened[0]!;
      expect(opened.providerSessionId).toBe(providerSessionId);
      expect(opened.runtimePolicy.cwd).toBe("/work");
      expect(opened.mcp).toEqual({
        endpoint: "http://127.0.0.1:3000/mcp",
        authorizationHeader: "Bearer provider-token",
      });
      // The host stamps the session identity whatever the pack reports.
      expect(runtime.providerSession.id).toBe(providerSessionId);
      expect(runtime.providerSession.driver).toBe(PACK_DRIVER);
      expect(runtime.providerSession.providerInstanceId).toBe(instanceId);

      const providerThread = yield* runtime.ensureThread({
        threadId,
        modelSelection,
        runtimePolicy,
      });
      expect(providerThread.id).toBe(ProviderThreadId.make("provider-thread:thread-1"));
      const snapshot = yield* runtime.readThreadSnapshot({ providerThread });
      expect(snapshot.providerThread.id).toBe(providerThread.id);

      yield* Scope.close(sessionScope, Exit.void);
      expect(pack.log).toContain("close");
      yield* Scope.close(scope, Exit.void);
      expect(pack.log.at(-1)).toBe("dispose");
    }),
  );

  it.effect("restamps and decodes events, dropping undecodable ones", () =>
    Effect.gen(function* () {
      const pack = makeScriptedPack();
      const { runtime } = yield* openSession(pack.definition);
      pack.events.push({ type: "not-a-real-event" });
      pack.events.push({
        type: "provider_thread.updated",
        driver: "someone-else",
        providerThread: providerThreadJson(threadId, providerSessionId),
      });
      const [event] = yield* runtime.events.pipe(Stream.take(1), Stream.runCollect);
      expect(event?.type).toBe("provider_thread.updated");
      expect(event?.driver).toBe(PACK_DRIVER);
    }),
  );

  it.effect("fails the stream on an undecodable turn.terminal so the run cannot hang", () =>
    Effect.gen(function* () {
      const pack = makeScriptedPack();
      const { runtime } = yield* openSession(pack.definition);
      pack.events.push({ type: "turn.terminal", status: "completed" });
      const error = yield* runtime.events.pipe(Stream.runDrain, Effect.flip);
      expect(error._tag).toBe("ProviderAdapterProtocolError");
    }),
  );

  it.effect("ends the event stream when the session scope closes", () =>
    Effect.gen(function* () {
      const pack = makeScriptedPack({ session: { close: async () => undefined } });
      const { runtime, sessionScope } = yield* openSession(pack.definition);
      const fiber = yield* runtime.events.pipe(Stream.runDrain, Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Scope.close(sessionScope, Exit.void);
      const exit = yield* Fiber.await(fiber);
      expect(Exit.isSuccess(exit)).toBe(true);
    }),
  );

  it.effect("reports missing optional methods as the adapter's own errors", () =>
    Effect.gen(function* () {
      const { runtime } = yield* openSession(makeScriptedPack().definition);
      const providerThread = yield* runtime.ensureThread({
        threadId,
        modelSelection,
        runtimePolicy,
      });
      const steer = yield* runtime
        .steerTurn({
          threadId,
          runId: "run-1" as never,
          providerThread,
          providerTurnId: "turn-1" as never,
          message: {
            messageId: "message-1" as never,
            text: "more",
            attachments: [],
            createdBy: "user",
            creationSource: "web",
          },
        })
        .pipe(Effect.flip);
      expect(steer._tag).toBe("ProviderAdapterSteerRunUnsupportedError");
      expect(runtime.jobControl).toBeUndefined();
      expect(runtime.injectHistory).toBeUndefined();
    }),
  );

  it.effect("forwards job control and decodes its result", () =>
    Effect.gen(function* () {
      const requests: unknown[] = [];
      const { runtime } = yield* openSession(
        withSession({
          jobControl: async (input) => {
            requests.push(input.request);
            return { kind: "unknown-job", jobId: "job-1" };
          },
        }),
      );
      const providerThread = yield* runtime.ensureThread({
        threadId,
        modelSelection,
        runtimePolicy,
      });
      const result = yield* runtime.jobControl!({
        providerThread,
        request: { kind: "cancel", jobId: "job-1" },
      });
      expect(result).toEqual({ kind: "unknown-job", jobId: "job-1" });
      expect(requests).toEqual([{ kind: "cancel", jobId: "job-1" }]);
    }),
  );

  it.effect("offers a pack wake request to the host continuation queue", () =>
    Effect.gen(function* () {
      const pack = makeScriptedPack();
      yield* openSession(pack.definition);
      pack.requestContinuation({
        threadId,
        providerThreadId: "provider-thread:thread-1",
        detail: "Job job-1 finished.",
        notification: {
          source: { kind: "background_command" },
          outcome: "completed",
          summary: "Job finished",
        },
        delivery: "message_text",
      });
      const requests = yield* ProviderContinuationRequests.ProviderContinuationRequests;
      const request = yield* requests.take;
      expect(request.threadId).toBe(threadId);
      expect(request.driver).toBe(PACK_DRIVER);
      expect(request.detail).toBe("Job job-1 finished.");
      expect(request.delivery).toBe("message_text");
      expect(request.notification?.summary).toBe("Job finished");
    }).pipe(Effect.provide(Layer.fresh(ProviderContinuationRequests.layer))),
  );

  it.effect("bounds a hung dispose() with a timeout", () =>
    Effect.gen(function* () {
      const pack = makeScriptedPack();
      let disposeCalled = false;
      const { scope } = yield* createInScope({
        ...pack.definition,
        create: async () => ({
          ...pack.instance,
          dispose: () => {
            disposeCalled = true;
            return new Promise<void>(() => {});
          },
        }),
      });
      const closeFiber = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild);
      yield* TestClock.adjust(Duration.seconds(5));
      expect(Exit.isSuccess(yield* Fiber.await(closeFiber))).toBe(true);
      expect(disposeCalled).toBe(true);
    }),
  );

  it.effect("surfaces a pack create rejection as ProviderDriverError", () =>
    Effect.gen(function* () {
      const error = yield* bridgePackProviderDriver({
        schemaVersion: 2,
        driver: "boom",
        displayName: "Boom",
        create: async () => {
          throw new Error("nope");
        },
      })
        .create({
          instanceId: ProviderInstanceId.make("boom"),
          displayName: "Boom",
          environment: [],
          enabled: true,
          config: {},
        })
        .pipe(Effect.scoped, Effect.flip);
      expect(error._tag).toBe("ProviderDriverError");
      expect(error.detail).toContain("nope");
    }),
  );

  it.effect("passes the agent-instructions setting to create, omitting it when unset", () =>
    Effect.gen(function* () {
      const pack = makeScriptedPack();
      const capture = () => {
        const seen: Array<string | undefined> = [];
        return createInScope({
          ...pack.definition,
          create: async (input) => {
            seen.push(input.agentInstructions);
            return pack.instance;
          },
        }).pipe(Effect.map(({ scope }) => ({ scope, seen })));
      };
      const set = yield* capture().pipe(
        Effect.provide(serverSettingsLayerTest({ agentInstructions: "Be brief." })),
      );
      expect(set.seen).toEqual(["Be brief."]);
      const empty = yield* capture().pipe(Effect.provide(serverSettingsLayerTest({})));
      expect(empty.seen).toEqual([undefined]);
      const bare = yield* capture();
      expect(bare.seen).toEqual([undefined]);
      for (const run of [set, empty, bare]) yield* Scope.close(run.scope, Exit.void);
    }),
  );
});
