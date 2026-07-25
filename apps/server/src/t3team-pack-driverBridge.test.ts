import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import type {
  PackProviderDriverDefinition,
  PackProviderInstance,
  PackSendTurnInput,
  PackSessionStartInput,
} from "@t3team/packs";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { clearMcpProviderSession, setMcpProviderSession } from "./mcp/McpProviderSession.ts";
import { bridgePackProviderDriver } from "./t3team-pack-driverBridge.ts";

const validEvent = {
  type: "session.started",
  eventId: "e1",
  createdAt: "2026-02-28T00:00:00.000Z",
  threadId: "thread-1",
  payload: { message: "hello" },
};

const baseInstance = (log: string[]): PackProviderInstance => ({
  snapshot: () => ({
    displayName: "Fake",
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    models: [{ slug: "nexi/coding", name: "Coding" }],
  }),
  startSession: async (input) => {
    log.push(`start:${input.threadId}:${String(input.resumeCursor)}`);
    return {
      threadId: input.threadId,
      status: "ready",
      runtimeMode: input.runtimeMode,
      resumeCursor: input.resumeCursor ?? "cursor-default",
    };
  },
  sendTurn: async (input) => ({ threadId: input.threadId, turnId: "turn-1" }),
  interruptTurn: async () => undefined,
  respondToRequest: async () => undefined,
  respondToUserInput: async () => undefined,
  stopSession: async () => undefined,
  hasSession: async (threadId) => threadId === "known",
  listSessions: async () => [{ threadId: "known", status: "ready", runtimeMode: "full-access" }],
  readThread: async (threadId) => ({ threadId, turns: [] }),
  rollbackThread: async (threadId) => ({ threadId, turns: [] }),
  stopAll: async () => undefined,
  events: async function* () {
    yield validEvent;
    yield { type: "not-a-real-event", eventId: "e2" };
  },
  dispose: async () => {
    log.push("dispose");
  },
});

const makeInstance = (
  log: string[],
  overrides: Partial<PackProviderInstance> = {},
): PackProviderInstance => ({ ...baseInstance(log), ...overrides });

const definitionFor = (instance: PackProviderInstance): PackProviderDriverDefinition => ({
  schemaVersion: 1,
  driver: "nexi",
  displayName: "Nexi",
  create: async () => instance,
});

const createInScope = (instance: PackProviderInstance) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const built = yield* bridgePackProviderDriver(definitionFor(instance))
      .create({
        instanceId: ProviderInstanceId.make("nexi"),
        displayName: "Nexi",
        environment: [],
        enabled: true,
        config: {},
      })
      .pipe(Effect.provideService(Scope.Scope, scope));
    return { scope, instance: built };
  });

describe("bridgePackProviderDriver", () => {
  it.effect("materializes an instance and round-trips the adapter surface", () =>
    Effect.gen(function* () {
      const log: string[] = [];
      const { scope, instance } = yield* createInScope(makeInstance(log));
      expect(instance.driverKind).toBe("nexi");

      const session = yield* instance.adapter.startSession({
        threadId: ThreadId.make("thread-1"),
        runtimeMode: "full-access",
        resumeCursor: "cursor-9",
      });
      expect(session.provider).toBe("nexi");
      expect(session.providerInstanceId).toBe("nexi");
      expect(session.resumeCursor).toBe("cursor-9");
      expect(log).toContain("start:thread-1:cursor-9");

      expect(yield* instance.adapter.hasSession(ThreadId.make("known"))).toBe(true);
      expect(yield* instance.adapter.hasSession(ThreadId.make("missing"))).toBe(false);

      const sessions = yield* instance.adapter.listSessions();
      expect(sessions.map((entry) => entry.provider)).toEqual(["nexi"]);

      const events = yield* Stream.runCollect(instance.adapter.streamEvents);
      expect(events).toHaveLength(1);
      expect(events[0]?.provider).toBe("nexi");
      expect(events[0]?.type).toBe("session.started");

      const snapshot = yield* instance.snapshot.getSnapshot;
      expect(snapshot.driver).toBe("nexi");
      expect(snapshot.configurationSource).toBe("pack");

      expect(log).not.toContain("dispose");
      yield* Scope.close(scope, Exit.void);
      expect(log).toContain("dispose");
    }),
  );

  it.effect("forwards all session and turn fields to the pack (fix 1)", () =>
    Effect.gen(function* () {
      const log: string[] = [];
      const startArgs: PackSessionStartInput[] = [];
      const turnArgs: PackSendTurnInput[] = [];
      const { instance } = yield* createInScope(
        makeInstance(log, {
          startSession: async (input) => {
            startArgs.push(input);
            return { threadId: input.threadId, status: "ready", runtimeMode: input.runtimeMode };
          },
          sendTurn: async (input) => {
            turnArgs.push(input);
            return { threadId: input.threadId, turnId: "turn-1" };
          },
        }),
      );

      const modelSelection = { instanceId: "nexi", model: "nexi/coding" } as never;
      const startThreadId = ThreadId.make("thread-1");
      setMcpProviderSession({
        environmentId: EnvironmentId.make("environment-1"),
        threadId: startThreadId,
        providerSessionId: "provider-session-1",
        providerInstanceId: ProviderInstanceId.make("nexi"),
        endpoint: "http://127.0.0.1:3000/mcp",
        authorizationHeader: "Bearer provider-token",
      });
      yield* instance.adapter
        .startSession({
          threadId: startThreadId,
          runtimeMode: "full-access",
          modelSelection,
          approvalPolicy: "on-request",
          sandboxMode: "workspace-write",
        })
        .pipe(Effect.ensuring(Effect.sync(() => clearMcpProviderSession(startThreadId))));
      expect(startArgs[0]).toEqual(
        expect.objectContaining({
          mcp: {
            endpoint: "http://127.0.0.1:3000/mcp",
            authorizationHeader: "Bearer provider-token",
          },
        }),
      );
      expect(startArgs[0]?.modelSelection).toEqual({ instanceId: "nexi", model: "nexi/coding" });
      expect(startArgs[0]?.approvalPolicy).toBe("on-request");
      expect(startArgs[0]?.sandboxMode).toBe("workspace-write");

      yield* instance.adapter.sendTurn({
        threadId: ThreadId.make("thread-1"),
        input: "hi",
        attachments: [{ type: "image", id: "a1", name: "x", mimeType: "image/png", sizeBytes: 1 }],
        modelSelection,
        interactionMode: "plan",
      });
      expect(turnArgs[0]?.attachments).toHaveLength(1);
      expect(turnArgs[0]?.modelSelection).toEqual({ instanceId: "nexi", model: "nexi/coding" });
      expect(turnArgs[0]?.interactionMode).toBe("plan");
    }),
  );

  it.effect("ends the event stream when the instance scope closes (fix 2)", () =>
    Effect.gen(function* () {
      const log: string[] = [];
      const { scope, instance } = yield* createInScope(
        makeInstance(log, {
          events: async function* () {
            yield validEvent;
            // Never terminates on its own — only scope close should end it.
            await new Promise<void>(() => {});
          },
        }),
      );
      const fiber = yield* Stream.runForEach(instance.adapter.streamEvents, () => Effect.void).pipe(
        Effect.forkChild,
      );
      yield* Scope.close(scope, Exit.void);
      const exit = yield* Fiber.await(fiber);
      expect(Exit.isSuccess(exit)).toBe(true);
    }),
  );

  it.effect("synthesizes a turn failure for an undecodable terminal event (fix 6)", () =>
    Effect.gen(function* () {
      const log: string[] = [];
      const { instance } = yield* createInScope(
        makeInstance(log, {
          events: async function* () {
            yield { type: "bogus", eventId: "b1", threadId: "t1", turnId: "u1" };
            yield { type: "bogus", eventId: "b2" };
          },
        }),
      );
      const events = yield* Stream.runCollect(instance.adapter.streamEvents);
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("turn.completed");
      expect(events[0]?.provider).toBe("nexi");
      expect(events[0]?.turnId).toBe("u1");
    }),
  );

  it.effect("recovers when events() throws synchronously (fix 3a)", () =>
    Effect.gen(function* () {
      const log: string[] = [];
      const { instance } = yield* createInScope(
        makeInstance(log, {
          events: () => {
            throw new Error("sync boom");
          },
        }),
      );
      const events = yield* Stream.runCollect(instance.adapter.streamEvents);
      expect(events).toHaveLength(0);
    }),
  );

  it.effect("degrades a throwing snapshot to an error snapshot (fix 3b)", () =>
    Effect.gen(function* () {
      const log: string[] = [];
      const { instance } = yield* createInScope(
        makeInstance(log, {
          snapshot: () => {
            throw new Error("snap boom");
          },
        }),
      );
      const snapshot = yield* instance.snapshot.getSnapshot;
      expect(snapshot.status).toBe("error");
      expect(snapshot.installed).toBe(false);
      expect(snapshot.message).toContain("snap boom");
    }),
  );

  it.effect("tolerates a malformed thread snapshot (fix 3c)", () =>
    Effect.gen(function* () {
      const log: string[] = [];
      const { instance } = yield* createInScope(
        makeInstance(log, {
          readThread: async (threadId) =>
            ({ threadId, turns: "not-an-array" }) as unknown as {
              threadId: string;
              turns: readonly unknown[];
            },
        }),
      );
      const snapshot = yield* instance.adapter.readThread(ThreadId.make("t1"));
      expect(snapshot.turns).toEqual([]);
    }),
  );

  it.effect("bounds a hung dispose() with a timeout (fix 4)", () =>
    Effect.gen(function* () {
      const log: string[] = [];
      let disposeCalled = false;
      const { scope } = yield* createInScope(
        makeInstance(log, {
          dispose: () => {
            disposeCalled = true;
            return new Promise<void>(() => {});
          },
        }),
      );
      const closeFiber = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild);
      yield* TestClock.adjust(Duration.seconds(5));
      const exit = yield* Fiber.await(closeFiber);
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(disposeCalled).toBe(true);
    }),
  );

  it.effect("surfaces a pack create rejection as ProviderDriverError", () =>
    Effect.gen(function* () {
      const driver = bridgePackProviderDriver({
        schemaVersion: 1,
        driver: "boom",
        displayName: "Boom",
        create: async () => {
          throw new Error("nope");
        },
      });
      const result = yield* driver
        .create({
          instanceId: ProviderInstanceId.make("boom"),
          displayName: "Boom",
          environment: [],
          enabled: true,
          config: {},
        })
        .pipe(Effect.scoped, Effect.flip);
      expect(result._tag).toBe("ProviderDriverError");
      expect(result.detail).toContain("nope");
    }),
  );
});
