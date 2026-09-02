// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type {
  ProviderApprovalDecision,
  ProviderRuntimeEvent,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderTurnStartResult,
  ProviderUploadFeedbackInput,
  ProviderUploadFeedbackResult,
} from "@t3tools/contracts";
import {
  ApprovalRequestId,
  EnvironmentId,
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionStartInput,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { it, assert, describe, vi } from "@effect/vitest";

import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Metric from "effect/Metric";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { HttpServer } from "effect/unstable/http";

import {
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderUnsupportedError,
  ProviderValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "../Services/ProviderAdapterRegistry.ts";
import * as ProviderService from "../Services/ProviderService.ts";
import * as ProviderSessionDirectory from "../Services/ProviderSessionDirectory.ts";
import { makeProviderServiceLive } from "./ProviderService.ts";
import * as ProviderEventLoggers from "./ProviderEventLoggers.ts";
import { ProviderSessionDirectoryLive } from "./ProviderSessionDirectory.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ProviderSessionRuntime from "../../persistence/ProviderSessionRuntime.ts";
import {
  makeSqlitePersistenceLive,
  SqlitePersistenceMemory,
} from "../../persistence/Layers/Sqlite.ts";
import * as ServerConfig from "../../config.ts";
import * as ServerEnvironment from "../../environment/ServerEnvironment.ts";
import * as McpProviderSession from "../../mcp/McpProviderSession.ts";
import * as McpSessionRegistry from "../../mcp/McpSessionRegistry.ts";
import * as McpCredentialContinuity from "../../t3team-mcp-credentialContinuity.ts";
import * as ServerSettings from "../../serverSettings.ts";
import * as AnalyticsService from "../../telemetry/AnalyticsService.ts";
import { makeAdapterRegistryMock } from "../testUtils/providerAdapterRegistryMock.ts";

const defaultServerSettingsLayer = ServerSettings.ServerSettingsService.layerTest();
const serverConfigTestLayer = ServerConfig.layerTest(process.cwd(), process.cwd()).pipe(
  Layer.provide(NodeServices.layer),
);

const asRequestId = (value: string): ApprovalRequestId => ApprovalRequestId.make(value);
const asEventId = (value: string): EventId => EventId.make(value);
const asThreadId = (value: string): ThreadId => ThreadId.make(value);
const asTurnId = (value: string): TurnId => TurnId.make(value);
const codexInstanceId = ProviderInstanceId.make("codex");
const claudeAgentInstanceId = ProviderInstanceId.make("claudeAgent");
const CODEX_DRIVER = ProviderDriverKind.make("codex");
const CLAUDE_AGENT_DRIVER = ProviderDriverKind.make("claudeAgent");
const CURSOR_DRIVER = ProviderDriverKind.make("cursor");

type LegacyProviderRuntimeEvent = {
  readonly type: string;
  readonly eventId: EventId;
  readonly provider: ProviderDriverKind;
  readonly createdAt: string;
  readonly threadId: ThreadId;
  readonly turnId?: string | undefined;
  readonly itemId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly payload?: unknown | undefined;
  readonly [key: string]: unknown;
};

function makeFakeCodexAdapter(provider: ProviderDriverKind = CODEX_DRIVER) {
  const sessions = new Map<ThreadId, ProviderSession>();
  const runtimeEventPubSub = Effect.runSync(PubSub.unbounded<ProviderRuntimeEvent>());

  const startSession = vi.fn((input: ProviderSessionStartInput) =>
    Effect.sync(() => {
      const now = "2026-01-01T00:00:00.000Z";
      const session: ProviderSession = {
        provider,
        ...(input.providerInstanceId !== undefined
          ? { providerInstanceId: input.providerInstanceId }
          : {}),
        status: "ready",
        runtimeMode: input.runtimeMode,
        threadId: input.threadId,
        resumeCursor: input.resumeCursor ?? {
          opaque: `resume-${String(input.threadId)}`,
        },
        cwd: input.cwd ?? process.cwd(),
        createdAt: now,
        updatedAt: now,
      };
      sessions.set(session.threadId, session);
      return session;
    }),
  );

  const sendTurn = vi.fn(
    (
      input: ProviderSendTurnInput,
    ): Effect.Effect<ProviderTurnStartResult, ProviderAdapterError> => {
      if (!sessions.has(input.threadId)) {
        return Effect.fail(
          new ProviderAdapterSessionNotFoundError({
            provider,
            threadId: input.threadId,
          }),
        );
      }

      return Effect.succeed({
        threadId: input.threadId,
        turnId: TurnId.make(`turn-${String(input.threadId)}`),
      });
    },
  );

  const interruptTurn = vi.fn(
    (_threadId: ThreadId, _turnId?: TurnId): Effect.Effect<void, ProviderAdapterError> =>
      Effect.void,
  );

  const respondToRequest = vi.fn(
    (
      _threadId: ThreadId,
      _requestId: string,
      _decision: ProviderApprovalDecision,
    ): Effect.Effect<void, ProviderAdapterError> => Effect.void,
  );

  const respondToUserInput = vi.fn(
    (
      _threadId: ThreadId,
      _requestId: string,
      _answers: Record<string, unknown>,
    ): Effect.Effect<void, ProviderAdapterError> => Effect.void,
  );

  const stopSession = vi.fn(
    (threadId: ThreadId): Effect.Effect<void, ProviderAdapterError> =>
      Effect.sync(() => {
        sessions.delete(threadId);
      }),
  );

  const listSessions = vi.fn(
    (): Effect.Effect<ReadonlyArray<ProviderSession>> =>
      Effect.sync(() => Array.from(sessions.values())),
  );

  const hasSession = vi.fn(
    (threadId: ThreadId): Effect.Effect<boolean> => Effect.succeed(sessions.has(threadId)),
  );

  const readThread = vi.fn(
    (
      threadId: ThreadId,
    ): Effect.Effect<
      {
        threadId: ThreadId;
        turns: ReadonlyArray<{ id: TurnId; items: readonly [] }>;
      },
      ProviderAdapterError
    > =>
      Effect.succeed({
        threadId,
        turns: [{ id: asTurnId("turn-1"), items: [] }],
      }),
  );

  const rollbackThread = vi.fn(
    (
      threadId: ThreadId,
      _numTurns: number,
    ): Effect.Effect<{ threadId: ThreadId; turns: readonly [] }, ProviderAdapterError> =>
      Effect.succeed({ threadId, turns: [] }),
  );

  const uploadFeedback = vi.fn(
    (
      input: ProviderUploadFeedbackInput,
    ): Effect.Effect<ProviderUploadFeedbackResult, ProviderAdapterError> =>
      Effect.succeed({ feedbackId: `feedback-${input.threadId}` }),
  );

  const stopAll = vi.fn(
    (): Effect.Effect<void, ProviderAdapterError> =>
      Effect.sync(() => {
        sessions.clear();
      }),
  );

  const adapter: ProviderAdapterShape<ProviderAdapterError> = {
    provider,
    capabilities: {
      sessionModelSwitch: "in-session",
    },
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions,
    hasSession,
    readThread,
    rollbackThread,
    ...(provider === CODEX_DRIVER ? { uploadFeedback } : {}),
    stopAll,
    get streamEvents() {
      return Stream.fromPubSub(runtimeEventPubSub);
    },
  };

  const emit = (event: LegacyProviderRuntimeEvent): void => {
    Effect.runSync(PubSub.publish(runtimeEventPubSub, event as unknown as ProviderRuntimeEvent));
  };

  const updateSession = (
    threadId: ThreadId,
    update: (session: ProviderSession) => ProviderSession,
  ): void => {
    const existing = sessions.get(threadId);
    if (!existing) {
      return;
    }
    sessions.set(threadId, update(existing));
  };

  return {
    adapter,
    emit,
    updateSession,
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions,
    hasSession,
    readThread,
    rollbackThread,
    uploadFeedback,
    stopAll,
  };
}

const advanceTestClock = (ms: number) =>
  TestClock.adjust(`${ms} millis`).pipe(Effect.andThen(Effect.yieldNow));

const hasMetricSnapshot = (
  snapshots: ReadonlyArray<Metric.Metric.Snapshot>,
  id: string,
  attributes: Readonly<Record<string, string>>,
) =>
  snapshots.some(
    (snapshot) =>
      snapshot.id === id &&
      Object.entries(attributes).every(([key, value]) => snapshot.attributes?.[key] === value),
  );

function makeProviderServiceLayer() {
  const codex = makeFakeCodexAdapter();
  const claude = makeFakeCodexAdapter(CLAUDE_AGENT_DRIVER);
  const cursor = makeFakeCodexAdapter(CURSOR_DRIVER);
  const registry = makeAdapterRegistryMock({
    [ProviderDriverKind.make("codex")]: codex.adapter,
    [ProviderDriverKind.make("claudeAgent")]: claude.adapter,
    [ProviderDriverKind.make("cursor")]: cursor.adapter,
  });

  const providerAdapterLayer = Layer.succeed(
    ProviderAdapterRegistry.ProviderAdapterRegistry,
    registry,
  );
  const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  const directoryLayer = ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer));

  const layer = it.layer(
    Layer.mergeAll(
      makeProviderServiceLive().pipe(
        Layer.provide(providerAdapterLayer),
        Layer.provide(directoryLayer),
        Layer.provide(defaultServerSettingsLayer),
        Layer.provide(serverConfigTestLayer),
        Layer.provideMerge(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      ),
      directoryLayer,

      runtimeRepositoryLayer,
      NodeServices.layer,
    ),
  );

  return {
    codex,
    claude,
    cursor,
    layer,
  };
}

it.effect("ProviderServiceLive catches stopAll failures during shutdown", () =>
  Effect.gen(function* () {
    const codex = makeFakeCodexAdapter();
    codex.stopAll.mockImplementation(() =>
      Effect.fail(
        new ProviderAdapterRequestError({
          provider: String(CODEX_DRIVER),
          method: "stopAll",
          detail: "simulated stopAll failure",
        }),
      ),
    );
    const registry = makeAdapterRegistryMock({
      [CODEX_DRIVER]: codex.adapter,
    });
    const providerAdapterLayer = Layer.succeed(
      ProviderAdapterRegistry.ProviderAdapterRegistry,
      registry,
    );
    const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
      Layer.provide(SqlitePersistenceMemory),
    );
    const directoryLayer = ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer));
    const providerLayer = Layer.mergeAll(
      makeProviderServiceLive().pipe(
        Layer.provide(providerAdapterLayer),
        Layer.provide(directoryLayer),
        Layer.provide(defaultServerSettingsLayer),
        Layer.provide(serverConfigTestLayer),
        Layer.provideMerge(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      ),
      directoryLayer,
      runtimeRepositoryLayer,
      NodeServices.layer,
    );
    const scope = yield* Scope.make();
    const runtimeServices = yield* Layer.build(providerLayer).pipe(Scope.provide(scope));

    yield* ProviderService.ProviderService.pipe(Effect.provide(runtimeServices));
    const closeExit = yield* Scope.close(scope, Exit.void).pipe(Effect.exit);

    assert.equal(Exit.isSuccess(closeExit), true);
    assert.equal(codex.stopAll.mock.calls.length, 1);
  }),
);

it.effect("ProviderServiceLive rejects new sessions for disabled providers", () =>
  Effect.gen(function* () {
    const codex = makeFakeCodexAdapter();
    const claude = makeFakeCodexAdapter(CLAUDE_AGENT_DRIVER);
    const registryBase = makeAdapterRegistryMock({
      [CODEX_DRIVER]: codex.adapter,
      [CLAUDE_AGENT_DRIVER]: claude.adapter,
    });
    const registry: ProviderAdapterRegistry.ProviderAdapterRegistry["Service"] = {
      ...registryBase,
      getInstanceInfo: (instanceId) =>
        instanceId === claudeAgentInstanceId
          ? Effect.succeed({
              instanceId,
              driverKind: CLAUDE_AGENT_DRIVER,
              displayName: undefined,
              enabled: false,
              continuationIdentity: {
                driverKind: CLAUDE_AGENT_DRIVER,
                continuationKey: "claudeAgent:instance:claudeAgent",
              },
            })
          : registryBase.getInstanceInfo(instanceId),
    };
    const providerAdapterLayer = Layer.succeed(
      ProviderAdapterRegistry.ProviderAdapterRegistry,
      registry,
    );
    const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
      Layer.provide(SqlitePersistenceMemory),
    );
    const directoryLayer = ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer));
    const providerLayer = makeProviderServiceLive().pipe(
      Layer.provide(providerAdapterLayer),
      Layer.provide(directoryLayer),
      Layer.provide(defaultServerSettingsLayer),
      Layer.provide(serverConfigTestLayer),
      Layer.provide(AnalyticsService.layerTest),
      Layer.provide(
        Layer.succeed(
          ProviderEventLoggers.ProviderEventLoggers,
          ProviderEventLoggers.NoOpProviderEventLoggers,
        ),
      ),
    );

    const failure = yield* Effect.flip(
      Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        return yield* provider.startSession(asThreadId("thread-disabled"), {
          provider: ProviderDriverKind.make("claudeAgent"),
          providerInstanceId: claudeAgentInstanceId,
          threadId: asThreadId("thread-disabled"),
          runtimeMode: "full-access",
        });
      }).pipe(Effect.provide(providerLayer)),
    );

    assert.instanceOf(failure, ProviderValidationError);
    assert.include(failure.issue, "Provider instance 'claudeAgent' is disabled");
    assert.equal(claude.startSession.mock.calls.length, 0);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "ProviderServiceLive allows enabled custom instances when legacy driver is disabled",
  () =>
    Effect.gen(function* () {
      const instanceId = ProviderInstanceId.make("codex_personal");
      const driverKind = CODEX_DRIVER;
      const codex = makeFakeCodexAdapter();
      const unsupported = () =>
        new ProviderUnsupportedError({
          provider: driverKind,
        });
      const registry: ProviderAdapterRegistry.ProviderAdapterRegistry["Service"] = {
        getByInstance: (requestedInstanceId) =>
          requestedInstanceId === instanceId
            ? Effect.succeed(codex.adapter)
            : Effect.fail(unsupported()),
        getInstanceInfo: (requestedInstanceId) =>
          requestedInstanceId === instanceId
            ? Effect.succeed({
                instanceId,
                driverKind,
                displayName: "Codex Personal",
                enabled: true,
                continuationIdentity: {
                  driverKind,
                  continuationKey: "codex:/Users/example/.codex",
                },
              })
            : Effect.fail(unsupported()),
        listInstances: () => Effect.succeed([instanceId]),
        listProviders: () => Effect.succeed([driverKind] as const),
        streamChanges: Stream.empty,
        subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), (pubsub) =>
          PubSub.subscribe(pubsub),
        ),
      };
      const providerAdapterLayer = Layer.succeed(
        ProviderAdapterRegistry.ProviderAdapterRegistry,
        registry,
      );
      const serverSettingsLayer = ServerSettings.ServerSettingsService.layerTest({
        providers: {
          codex: {
            enabled: false,
          },
        },
      });
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const directoryLayer = ProviderSessionDirectoryLive.pipe(
        Layer.provide(runtimeRepositoryLayer),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(providerAdapterLayer),
        Layer.provide(directoryLayer),
        Layer.provide(serverSettingsLayer),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      const session = yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        return yield* provider.startSession(asThreadId("thread-enabled-custom"), {
          provider: driverKind,
          providerInstanceId: instanceId,
          threadId: asThreadId("thread-enabled-custom"),
          runtimeMode: "full-access",
        });
      }).pipe(Effect.provide(providerLayer));

      assert.equal(session.providerInstanceId, instanceId);
      assert.equal(codex.startSession.mock.calls.length, 1);
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("ProviderServiceLive rejects new sessions for disabled custom instances", () =>
  Effect.gen(function* () {
    const instanceId = ProviderInstanceId.make("codex_personal");
    const driverKind = ProviderDriverKind.make("codex");
    const codex = makeFakeCodexAdapter();
    const unsupported = () =>
      new ProviderUnsupportedError({
        provider: ProviderDriverKind.make("codex"),
      });
    const registry: ProviderAdapterRegistry.ProviderAdapterRegistry["Service"] = {
      getByInstance: (requestedInstanceId) =>
        requestedInstanceId === instanceId
          ? Effect.succeed(codex.adapter)
          : Effect.fail(unsupported()),
      getInstanceInfo: (requestedInstanceId) =>
        requestedInstanceId === instanceId
          ? Effect.succeed({
              instanceId,
              driverKind,
              displayName: "Codex Personal",
              enabled: false,
              continuationIdentity: {
                driverKind,
                continuationKey: "codex:/Users/example/.codex",
              },
            })
          : Effect.fail(unsupported()),
      listInstances: () => Effect.succeed([instanceId]),
      listProviders: () => Effect.succeed([CODEX_DRIVER] as const),
      streamChanges: Stream.empty,
      subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), (pubsub) =>
        PubSub.subscribe(pubsub),
      ),
    };
    const providerAdapterLayer = Layer.succeed(
      ProviderAdapterRegistry.ProviderAdapterRegistry,
      registry,
    );
    const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
      Layer.provide(SqlitePersistenceMemory),
    );
    const directoryLayer = ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer));
    const providerLayer = makeProviderServiceLive().pipe(
      Layer.provide(providerAdapterLayer),
      Layer.provide(directoryLayer),
      Layer.provide(defaultServerSettingsLayer),
      Layer.provide(serverConfigTestLayer),
      Layer.provide(AnalyticsService.layerTest),
      Layer.provide(
        Layer.succeed(
          ProviderEventLoggers.ProviderEventLoggers,
          ProviderEventLoggers.NoOpProviderEventLoggers,
        ),
      ),
    );

    const failure = yield* Effect.flip(
      Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        return yield* provider.startSession(asThreadId("thread-disabled-instance"), {
          provider: ProviderDriverKind.make("codex"),
          providerInstanceId: instanceId,
          threadId: asThreadId("thread-disabled-instance"),
          runtimeMode: "full-access",
        });
      }).pipe(Effect.provide(providerLayer)),
    );

    assert.instanceOf(failure, ProviderValidationError);
    assert.include(failure.issue, "Provider instance 'codex_personal' is disabled");
    assert.equal(codex.startSession.mock.calls.length, 0);
  }).pipe(Effect.provide(NodeServices.layer)),
);

const routing = makeProviderServiceLayer();

it.effect(
  "ProviderServiceLive uploads feedback through the adapter that recovered the session",
  () =>
    Effect.gen(function* () {
      const original = makeFakeCodexAdapter();
      const replacement = makeFakeCodexAdapter();
      const baseRegistry = makeAdapterRegistryMock({ [CODEX_DRIVER]: original.adapter });
      let swapAfterFirstLookup = false;
      let feedbackLookupCount = 0;
      const registry: ProviderAdapterRegistry.ProviderAdapterRegistry["Service"] = {
        ...baseRegistry,
        getByInstance: (instanceId) => {
          if (instanceId !== codexInstanceId) {
            return baseRegistry.getByInstance(instanceId);
          }
          const useReplacement = swapAfterFirstLookup && feedbackLookupCount++ > 0;
          return Effect.succeed(useReplacement ? replacement.adapter : original.adapter);
        },
      };
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const directoryLayer = ProviderSessionDirectoryLive.pipe(
        Layer.provide(runtimeRepositoryLayer),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, registry)),
        Layer.provide(directoryLayer),
        Layer.provide(defaultServerSettingsLayer),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const threadId = asThreadId("thread-feedback-adapter-replacement");
        yield* provider.startSession(threadId, {
          provider: CODEX_DRIVER,
          providerInstanceId: codexInstanceId,
          threadId,
          runtimeMode: "full-access",
        });
        yield* original.stopSession(threadId);
        original.uploadFeedback.mockClear();
        replacement.uploadFeedback.mockClear();
        swapAfterFirstLookup = true;

        const result = yield* provider.uploadFeedback({ threadId });

        assert.deepStrictEqual(result, { feedbackId: `feedback-${threadId}` });
        assert.strictEqual(original.uploadFeedback.mock.calls.length, 0);
        assert.deepStrictEqual(replacement.uploadFeedback.mock.calls, [[{ threadId }]]);
      }).pipe(Effect.provide(providerLayer));
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("ProviderServiceLive writes canonical events to the emitting thread segment", () =>
  Effect.gen(function* () {
    const codex = makeFakeCodexAdapter();
    const canonicalEvents: ProviderRuntimeEvent[] = [];
    const canonicalThreadIds: Array<string | null> = [];
    const registry = makeAdapterRegistryMock({
      [ProviderDriverKind.make("codex")]: codex.adapter,
    });
    const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
      Layer.provide(SqlitePersistenceMemory),
    );
    const directoryLayer = ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer));
    const providerLayer = makeProviderServiceLive({
      canonicalEventLogger: {
        filePath: "memory://provider-canonical-events",
        write: (event, threadId) => {
          canonicalEvents.push(event as ProviderRuntimeEvent);
          canonicalThreadIds.push(threadId ?? null);
          return Effect.void;
        },
        close: () => Effect.void,
      },
    }).pipe(
      Layer.provide(Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, registry)),
      Layer.provide(directoryLayer),
      Layer.provide(defaultServerSettingsLayer),
      Layer.provide(serverConfigTestLayer),
      Layer.provide(AnalyticsService.layerTest),
      Layer.provide(
        Layer.succeed(
          ProviderEventLoggers.ProviderEventLoggers,
          ProviderEventLoggers.NoOpProviderEventLoggers,
        ),
      ),
    );

    yield* Effect.gen(function* () {
      yield* ProviderService.ProviderService;
      yield* advanceTestClock(10);
      codex.emit({
        eventId: asEventId("evt-canonical-thread-segment"),
        provider: ProviderDriverKind.make("codex"),
        threadId: asThreadId("thread-canonical-thread-segment"),
        createdAt: "2026-01-01T00:00:00.000Z",
        type: "turn.completed",
        payload: {
          state: "completed",
        },
      });
      yield* advanceTestClock(20);
    }).pipe(Effect.provide(providerLayer));

    assert.equal(canonicalEvents.length, 1);
    assert.equal(canonicalEvents[0]?.threadId, "thread-canonical-thread-segment");
    assert.deepEqual(canonicalThreadIds, ["thread-canonical-thread-segment"]);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("ProviderServiceLive keeps persisted resumable sessions on startup", () =>
  Effect.gen(function* () {
    const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-provider-service-"));
    const dbPath = NodePath.join(tempDir, "orchestration.sqlite");

    const codex = makeFakeCodexAdapter();
    const registry = makeAdapterRegistryMock({
      [ProviderDriverKind.make("codex")]: codex.adapter,
    });

    const persistenceLayer = makeSqlitePersistenceLive(dbPath);
    const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
      Layer.provide(persistenceLayer),
    );
    const directoryLayer = ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer));

    yield* Effect.gen(function* () {
      const directory = yield* ProviderSessionDirectory.ProviderSessionDirectory;
      yield* directory.upsert({
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: ThreadId.make("thread-stale"),
      });
    }).pipe(Effect.provide(directoryLayer));

    const providerLayer = makeProviderServiceLive().pipe(
      Layer.provide(Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, registry)),
      Layer.provide(directoryLayer),
      Layer.provide(defaultServerSettingsLayer),
      Layer.provide(serverConfigTestLayer),
      Layer.provide(AnalyticsService.layerTest),
      Layer.provide(
        Layer.succeed(
          ProviderEventLoggers.ProviderEventLoggers,
          ProviderEventLoggers.NoOpProviderEventLoggers,
        ),
      ),
    );

    yield* ProviderService.ProviderService.pipe(Effect.provide(providerLayer));

    const persistedProvider = yield* Effect.gen(function* () {
      const directory = yield* ProviderSessionDirectory.ProviderSessionDirectory;
      return yield* directory.getProvider(asThreadId("thread-stale"));
    }).pipe(Effect.provide(directoryLayer));
    assert.equal(persistedProvider, "codex");

    const runtime = yield* Effect.gen(function* () {
      const repository = yield* ProviderSessionRuntime.ProviderSessionRuntimeRepository;
      return yield* repository.getByThreadId({
        threadId: asThreadId("thread-stale"),
      });
    }).pipe(Effect.provide(runtimeRepositoryLayer));
    assert.equal(Option.isSome(runtime), true);

    const legacyTableRows = yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return yield* sql<{ readonly name: string }>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'provider_sessions'
      `;
    }).pipe(Effect.provide(persistenceLayer));
    assert.equal(legacyTableRows.length, 0);

    NodeFS.rmSync(tempDir, { recursive: true, force: true });
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "ProviderServiceLive restores rollback routing after restart using persisted thread mapping",
  () =>
    Effect.gen(function* () {
      const tempDir = NodeFS.mkdtempSync(
        NodePath.join(NodeOS.tmpdir(), "t3-provider-service-restart-"),
      );
      const dbPath = NodePath.join(tempDir, "orchestration.sqlite");
      const persistenceLayer = makeSqlitePersistenceLive(dbPath);
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(persistenceLayer),
      );

      const firstCodex = makeFakeCodexAdapter();
      const firstRegistry = makeAdapterRegistryMock({
        [ProviderDriverKind.make("codex")]: firstCodex.adapter,
      });

      const firstDirectoryLayer = ProviderSessionDirectoryLive.pipe(
        Layer.provide(runtimeRepositoryLayer),
      );
      const firstProviderLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, firstRegistry),
        ),
        Layer.provide(firstDirectoryLayer),
        Layer.provide(defaultServerSettingsLayer),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );
      const updatedResumeCursor = {
        threadId: asThreadId("thread-1"),
        resume: "resume-session-1",
        resumeSessionAt: "assistant-message-1",
        turnCount: 1,
      };

      const startedSession = yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const threadId = asThreadId("thread-1");
        const session = yield* provider.startSession(threadId, {
          provider: ProviderDriverKind.make("codex"),
          providerInstanceId: codexInstanceId,
          cwd: "/tmp/project",
          runtimeMode: "full-access",
          threadId,
        });
        firstCodex.updateSession(threadId, (existing) => ({
          ...existing,
          status: "ready",
          resumeCursor: updatedResumeCursor,
          updatedAt: "2026-01-01T00:00:01.000Z",
        }));
        return session;
      }).pipe(Effect.provide(firstProviderLayer));

      const persistedAfterStopAll = yield* Effect.gen(function* () {
        const repository = yield* ProviderSessionRuntime.ProviderSessionRuntimeRepository;
        return yield* repository.getByThreadId({
          threadId: startedSession.threadId,
        });
      }).pipe(Effect.provide(runtimeRepositoryLayer));
      assert.equal(Option.isSome(persistedAfterStopAll), true);
      if (Option.isSome(persistedAfterStopAll)) {
        assert.equal(persistedAfterStopAll.value.status, "stopped");
        assert.deepEqual(persistedAfterStopAll.value.resumeCursor, updatedResumeCursor);
      }

      const secondCodex = makeFakeCodexAdapter();
      const secondRegistry = makeAdapterRegistryMock({
        [ProviderDriverKind.make("codex")]: secondCodex.adapter,
      });
      const secondDirectoryLayer = ProviderSessionDirectoryLive.pipe(
        Layer.provide(runtimeRepositoryLayer),
      );
      const secondProviderLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, secondRegistry),
        ),
        Layer.provide(secondDirectoryLayer),
        Layer.provide(defaultServerSettingsLayer),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      secondCodex.startSession.mockClear();
      secondCodex.rollbackThread.mockClear();

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        yield* provider.rollbackConversation({
          threadId: startedSession.threadId,
          numTurns: 1,
        });
      }).pipe(Effect.provide(secondProviderLayer));

      assert.equal(secondCodex.startSession.mock.calls.length, 1);
      const resumedStartInput = secondCodex.startSession.mock.calls[0]?.[0];
      assert.equal(typeof resumedStartInput === "object" && resumedStartInput !== null, true);
      if (resumedStartInput && typeof resumedStartInput === "object") {
        const startPayload = resumedStartInput as {
          provider?: string;
          cwd?: string;
          resumeCursor?: unknown;
          threadId?: string;
        };
        assert.equal(startPayload.provider, "codex");
        assert.equal(startPayload.cwd, "/tmp/project");
        assert.deepEqual(startPayload.resumeCursor, updatedResumeCursor);
        assert.equal(startPayload.threadId, startedSession.threadId);
      }
      assert.equal(secondCodex.rollbackThread.mock.calls.length, 1);
      const rollbackCall = secondCodex.rollbackThread.mock.calls[0];
      assert.equal(typeof rollbackCall?.[0], "string");
      assert.equal(rollbackCall?.[1], 1);

      NodeFS.rmSync(tempDir, { recursive: true, force: true });
    }).pipe(Effect.provide(NodeServices.layer)),
);

routing.layer("ProviderServiceLive routing", (it) => {
  it.effect("routes provider operations and rollback conversation", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      const session = yield* provider.startSession(asThreadId("thread-1"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-1"),
        cwd: "/tmp/project",
        runtimeMode: "full-access",
      });
      assert.equal(session.provider, "codex");

      const sessions = yield* provider.listSessions();
      assert.equal(sessions.length, 1);

      yield* provider.sendTurn({
        threadId: session.threadId,
        input: "hello",
        attachments: [],
      });
      assert.equal(routing.codex.sendTurn.mock.calls.length, 1);

      yield* provider.interruptTurn({ threadId: session.threadId });
      assert.deepEqual(routing.codex.interruptTurn.mock.calls, [[session.threadId, undefined]]);

      yield* provider.respondToRequest({
        threadId: session.threadId,
        requestId: asRequestId("req-1"),
        decision: "accept",
      });
      assert.deepEqual(routing.codex.respondToRequest.mock.calls, [
        [session.threadId, asRequestId("req-1"), "accept"],
      ]);

      yield* provider.respondToUserInput({
        threadId: session.threadId,
        requestId: asRequestId("req-user-input-1"),
        answers: {
          sandbox_mode: "workspace-write",
        },
      });
      assert.deepEqual(routing.codex.respondToUserInput.mock.calls, [
        [
          session.threadId,
          asRequestId("req-user-input-1"),
          {
            sandbox_mode: "workspace-write",
          },
        ],
      ]);

      yield* provider.rollbackConversation({
        threadId: session.threadId,
        numTurns: 0,
      });

      yield* provider.stopSession({ threadId: session.threadId });
      routing.codex.startSession.mockClear();
      routing.codex.sendTurn.mockClear();

      yield* provider.sendTurn({
        threadId: session.threadId,
        input: "after-stop",
        attachments: [],
      });

      assert.equal(routing.codex.startSession.mock.calls.length, 1);
      const resumedStartInput = routing.codex.startSession.mock.calls[0]?.[0];
      assert.equal(typeof resumedStartInput === "object" && resumedStartInput !== null, true);
      if (resumedStartInput && typeof resumedStartInput === "object") {
        const startPayload = resumedStartInput as {
          provider?: string;
          cwd?: string;
          resumeCursor?: unknown;
          threadId?: string;
        };
        assert.equal(startPayload.provider, "codex");
        assert.equal(startPayload.cwd, "/tmp/project");
        assert.deepEqual(startPayload.resumeCursor, session.resumeCursor);
        assert.equal(startPayload.threadId, session.threadId);
      }
      assert.equal(routing.codex.sendTurn.mock.calls.length, 1);
    }),
  );

  it.effect("routes feedback to the Codex adapter and returns its feedback ID", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const threadId = asThreadId("thread-feedback-route");
      yield* provider.startSession(threadId, {
        provider: CODEX_DRIVER,
        providerInstanceId: codexInstanceId,
        threadId,
        runtimeMode: "full-access",
      });
      routing.codex.uploadFeedback.mockClear();

      const result = yield* provider.uploadFeedback({
        threadId,
        reason: "The agent stopped early.",
      });

      assert.deepStrictEqual(result, { feedbackId: `feedback-${threadId}` });
      assert.deepStrictEqual(routing.codex.uploadFeedback.mock.calls, [
        [{ threadId, reason: "The agent stopped early." }],
      ]);
    }),
  );

  it.effect("recovers a stopped Codex session before uploading feedback", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const threadId = asThreadId("thread-feedback-recover");
      yield* provider.startSession(threadId, {
        provider: CODEX_DRIVER,
        providerInstanceId: codexInstanceId,
        threadId,
        cwd: "/tmp/feedback-project",
        runtimeMode: "full-access",
      });
      yield* routing.codex.stopSession(threadId);
      routing.codex.startSession.mockClear();
      routing.codex.uploadFeedback.mockClear();

      const result = yield* provider.uploadFeedback({ threadId });

      assert.deepStrictEqual(result, { feedbackId: `feedback-${threadId}` });
      assert.strictEqual(routing.codex.startSession.mock.calls.length, 1);
      assert.deepStrictEqual(routing.codex.uploadFeedback.mock.calls, [[{ threadId }]]);
    }),
  );

  it.effect("rejects feedback for providers that do not support uploads", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const threadId = asThreadId("thread-feedback-claude");
      yield* provider.startSession(threadId, {
        provider: CLAUDE_AGENT_DRIVER,
        providerInstanceId: claudeAgentInstanceId,
        threadId,
        runtimeMode: "full-access",
      });

      const error = yield* provider.uploadFeedback({ threadId }).pipe(Effect.flip);

      assert.instanceOf(error, ProviderValidationError);
      assert.include(error.issue, "does not support feedback uploads");
      routing.claude.startSession.mockClear();
    }),
  );

  it.effect("does not restart an unsupported provider before rejecting feedback", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const threadId = asThreadId("thread-feedback-unsupported-stopped");
      yield* provider.startSession(threadId, {
        provider: CLAUDE_AGENT_DRIVER,
        providerInstanceId: claudeAgentInstanceId,
        threadId,
        runtimeMode: "full-access",
      });
      yield* routing.claude.stopSession(threadId);
      routing.claude.startSession.mockClear();

      const error = yield* provider.uploadFeedback({ threadId }).pipe(Effect.flip);

      assert.instanceOf(error, ProviderValidationError);
      assert.include(error.issue, "does not support feedback uploads");
      assert.strictEqual(routing.claude.startSession.mock.calls.length, 0);
    }),
  );

  it.effect("appends attachment file paths to the turn input text", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      const session = yield* provider.startSession(asThreadId("thread-attach"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-attach"),
        cwd: "/tmp/project",
        runtimeMode: "full-access",
      });

      const attachment = {
        type: "image" as const,
        id: "thread-attach-12345678-1234-1234-1234-123456789abc",
        name: "screenshot.png",
        mimeType: "image/png",
        sizeBytes: 123,
      };

      routing.codex.sendTurn.mockClear();
      yield* provider.sendTurn({
        threadId: session.threadId,
        input: "use this screenshot",
        attachments: [attachment],
      });

      const turnInput = routing.codex.sendTurn.mock.calls[0]?.[0] as ProviderSendTurnInput;
      assert.equal(typeof turnInput.input, "string");
      const turnText = turnInput.input ?? "";
      assert.equal(turnText.startsWith("use this screenshot"), true);
      assert.include(turnText, '[Attached image "screenshot.png" is saved at: ');
      assert.equal(turnText.endsWith(`${attachment.id}.png]`), true);

      // An attachment-only turn stays valid and the injected line becomes the
      // whole input text, so the agent still learns the path.
      routing.codex.sendTurn.mockClear();
      yield* provider.sendTurn({
        threadId: session.threadId,
        attachments: [attachment],
      });
      const imageOnlyInput = routing.codex.sendTurn.mock.calls[0]?.[0] as ProviderSendTurnInput;
      assert.equal(imageOnlyInput.input?.startsWith('[Attached image "screenshot.png"'), true);

      yield* provider.stopSession({ threadId: session.threadId });
    }),
  );

  it.effect("appends the saved path of file attachments to the turn input text", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      const session = yield* provider.startSession(asThreadId("thread-file-attach"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-file-attach"),
        cwd: "/tmp/project",
        runtimeMode: "full-access",
      });

      const file = {
        type: "file" as const,
        id: "thread-file-attach-12345678-1234-1234-1234-123456789abc",
        name: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 123,
      };

      routing.codex.sendTurn.mockClear();
      yield* provider.sendTurn({
        threadId: session.threadId,
        input: "read these notes",
        attachments: [file],
      });

      const turnInput = routing.codex.sendTurn.mock.calls[0]?.[0] as ProviderSendTurnInput;
      const turnText = turnInput.input ?? "";
      assert.equal(turnText.startsWith("read these notes"), true);
      assert.include(turnText, '[Attached file "notes.txt" is saved at: ');
      assert.equal(turnText.endsWith(`${file.id}.bin]`), true);

      // File attachments reach the adapter unmodified — the adapter must not
      // inline them, only the path line carries them to the model.
      assert.deepEqual(turnInput.attachments, [file]);

      yield* provider.stopSession({ threadId: session.threadId });
    }),
  );

  it.effect("recovers stale persisted sessions for rollback by resuming thread identity", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      const initial = yield* provider.startSession(asThreadId("thread-1"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-1"),
        cwd: "/tmp/project",
        runtimeMode: "full-access",
      });
      yield* routing.codex.stopSession(initial.threadId);
      routing.codex.startSession.mockClear();
      routing.codex.rollbackThread.mockClear();

      yield* provider.rollbackConversation({
        threadId: initial.threadId,
        numTurns: 1,
      });

      assert.equal(routing.codex.startSession.mock.calls.length, 1);
      const resumedStartInput = routing.codex.startSession.mock.calls[0]?.[0];
      assert.equal(typeof resumedStartInput === "object" && resumedStartInput !== null, true);
      if (resumedStartInput && typeof resumedStartInput === "object") {
        const startPayload = resumedStartInput as {
          provider?: string;
          cwd?: string;
          resumeCursor?: unknown;
          threadId?: string;
        };
        assert.equal(startPayload.provider, "codex");
        assert.equal(startPayload.cwd, "/tmp/project");
        assert.deepEqual(startPayload.resumeCursor, initial.resumeCursor);
        assert.equal(startPayload.threadId, initial.threadId);
      }
      assert.equal(routing.codex.rollbackThread.mock.calls.length, 1);
      const rollbackCall = routing.codex.rollbackThread.mock.calls[0];
      assert.equal(rollbackCall?.[1], 1);
    }),
  );

  it.effect("preserves the persisted binding when stopping a session", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const runtimeRepository = yield* ProviderSessionRuntime.ProviderSessionRuntimeRepository;

      const initial = yield* provider.startSession(asThreadId("thread-reap-preserve"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-reap-preserve"),
        cwd: "/tmp/project-reap-preserve",
        runtimeMode: "full-access",
      });

      yield* provider.stopSession({ threadId: initial.threadId });

      const persistedAfterStop = yield* runtimeRepository.getByThreadId({
        threadId: initial.threadId,
      });
      assert.equal(Option.isSome(persistedAfterStop), true);
      if (Option.isSome(persistedAfterStop)) {
        assert.equal(persistedAfterStop.value.status, "stopped");
        assert.deepEqual(persistedAfterStop.value.resumeCursor, initial.resumeCursor);
      }

      routing.codex.startSession.mockClear();
      routing.codex.sendTurn.mockClear();

      yield* provider.sendTurn({
        threadId: initial.threadId,
        input: "resume after reap",
        attachments: [],
      });

      assert.equal(routing.codex.startSession.mock.calls.length, 1);
      const resumedStartInput = routing.codex.startSession.mock.calls[0]?.[0];
      assert.equal(typeof resumedStartInput === "object" && resumedStartInput !== null, true);
      if (resumedStartInput && typeof resumedStartInput === "object") {
        const startPayload = resumedStartInput as {
          provider?: string;
          cwd?: string;
          resumeCursor?: unknown;
          threadId?: string;
        };
        assert.equal(startPayload.provider, "codex");
        assert.equal(startPayload.cwd, "/tmp/project-reap-preserve");
        assert.deepEqual(startPayload.resumeCursor, initial.resumeCursor);
        assert.equal(startPayload.threadId, initial.threadId);
      }
      assert.equal(routing.codex.sendTurn.mock.calls.length, 1);
    }),
  );

  it.effect("routes explicit claudeAgent provider session starts to the claude adapter", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      const session = yield* provider.startSession(asThreadId("thread-claude"), {
        provider: ProviderDriverKind.make("claudeAgent"),
        providerInstanceId: claudeAgentInstanceId,
        threadId: asThreadId("thread-claude"),
        cwd: "/tmp/project-claude",
        runtimeMode: "full-access",
      });

      assert.equal(session.provider, "claudeAgent");
      assert.equal(routing.claude.startSession.mock.calls.length, 1);
      const startInput = routing.claude.startSession.mock.calls[0]?.[0];
      assert.equal(typeof startInput === "object" && startInput !== null, true);
      if (startInput && typeof startInput === "object") {
        const startPayload = startInput as {
          provider?: string;
          providerInstanceId?: ProviderInstanceId;
          cwd?: string;
        };
        assert.equal(startPayload.provider, "claudeAgent");
        assert.equal(startPayload.providerInstanceId, claudeAgentInstanceId);
        assert.equal(startPayload.cwd, "/tmp/project-claude");
      }
    }),
  );

  it.effect("dies when an active session conflicts with its persisted binding", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const directory = yield* ProviderSessionDirectory.ProviderSessionDirectory;
      const threadId = asThreadId("thread-binding-mismatch");

      yield* provider.startSession(threadId, {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId,
        cwd: "/tmp/project-binding-mismatch",
        runtimeMode: "full-access",
      });
      yield* directory.upsert({
        threadId,
        provider: ProviderDriverKind.make("claudeAgent"),
        providerInstanceId: claudeAgentInstanceId,
        runtimeMode: "full-access",
      });

      const exit = yield* Effect.exit(provider.listSessions());
      assert.equal(Exit.hasDies(exit), true);
      yield* directory.upsert({
        threadId,
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        runtimeMode: "full-access",
      });
    }),
  );

  it.effect("stops stale sessions in other providers after a successful replacement start", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const threadId = asThreadId("thread-provider-replacement");

      const codexSession = yield* provider.startSession(threadId, {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId,
        cwd: "/tmp/project-provider-replacement",
        runtimeMode: "full-access",
      });

      routing.codex.stopSession.mockClear();
      routing.claude.stopSession.mockClear();

      const claudeSession = yield* provider.startSession(threadId, {
        provider: ProviderDriverKind.make("claudeAgent"),
        providerInstanceId: claudeAgentInstanceId,
        threadId,
        cwd: "/tmp/project-provider-replacement",
        runtimeMode: "full-access",
      });

      assert.equal(codexSession.provider, "codex");
      assert.equal(claudeSession.provider, "claudeAgent");
      assert.deepEqual(routing.codex.stopSession.mock.calls, [[threadId]]);
      assert.equal(routing.claude.stopSession.mock.calls.length, 0);

      const sessions = yield* provider.listSessions();
      assert.deepEqual(
        sessions
          .filter((session) => session.threadId === threadId)
          .map((session) => session.provider),
        ["claudeAgent"],
      );
    }),
  );

  it.effect("recovers stale sessions for sendTurn using persisted cwd", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      const initial = yield* provider.startSession(asThreadId("thread-1"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-1"),
        cwd: "/tmp/project-send-turn",
        runtimeMode: "full-access",
      });

      yield* routing.codex.stopAll();
      routing.codex.startSession.mockClear();
      routing.codex.sendTurn.mockClear();

      yield* provider.sendTurn({
        threadId: initial.threadId,
        input: "resume",
        attachments: [],
      });

      assert.equal(routing.codex.startSession.mock.calls.length, 1);
      const resumedStartInput = routing.codex.startSession.mock.calls[0]?.[0];
      assert.equal(typeof resumedStartInput === "object" && resumedStartInput !== null, true);
      if (resumedStartInput && typeof resumedStartInput === "object") {
        const startPayload = resumedStartInput as {
          provider?: string;
          cwd?: string;
          resumeCursor?: unknown;
          threadId?: string;
        };
        assert.equal(startPayload.provider, "codex");
        assert.equal(startPayload.cwd, "/tmp/project-send-turn");
        assert.deepEqual(startPayload.resumeCursor, initial.resumeCursor);
        assert.equal(startPayload.threadId, initial.threadId);
      }
      assert.equal(routing.codex.sendTurn.mock.calls.length, 1);
    }),
  );

  it.effect("recovers stale claudeAgent sessions for sendTurn using persisted cwd", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      const initial = yield* provider.startSession(asThreadId("thread-claude-send-turn"), {
        provider: ProviderDriverKind.make("claudeAgent"),
        providerInstanceId: claudeAgentInstanceId,
        threadId: asThreadId("thread-claude-send-turn"),
        cwd: "/tmp/project-claude-send-turn",
        modelSelection: createModelSelection(
          ProviderInstanceId.make("claudeAgent"),
          "claude-opus-4-6",
          [{ id: "effort", value: "max" }],
        ),
        runtimeMode: "full-access",
      });

      yield* routing.claude.stopAll();
      routing.claude.startSession.mockClear();
      routing.claude.sendTurn.mockClear();

      yield* provider.sendTurn({
        threadId: initial.threadId,
        input: "resume with claude",
        attachments: [],
      });

      assert.equal(routing.claude.startSession.mock.calls.length, 1);
      const resumedStartInput = routing.claude.startSession.mock.calls[0]?.[0];
      assert.equal(typeof resumedStartInput === "object" && resumedStartInput !== null, true);
      if (resumedStartInput && typeof resumedStartInput === "object") {
        const startPayload = resumedStartInput as {
          provider?: string;
          cwd?: string;
          modelSelection?: unknown;
          resumeCursor?: unknown;
          threadId?: string;
        };
        assert.equal(startPayload.provider, "claudeAgent");
        assert.equal(startPayload.cwd, "/tmp/project-claude-send-turn");
        assert.deepEqual(
          startPayload.modelSelection,
          createModelSelection(ProviderInstanceId.make("claudeAgent"), "claude-opus-4-6", [
            { id: "effort", value: "max" },
          ]),
        );
        assert.deepEqual(startPayload.resumeCursor, initial.resumeCursor);
        assert.equal(startPayload.threadId, initial.threadId);
      }
      assert.equal(routing.claude.sendTurn.mock.calls.length, 1);
    }),
  );

  it.effect("lists no sessions after adapter runtime clears", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      yield* provider.startSession(asThreadId("thread-1"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-1"),
        runtimeMode: "full-access",
      });
      yield* provider.startSession(asThreadId("thread-2"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-2"),
        runtimeMode: "full-access",
      });

      yield* routing.codex.stopAll();
      yield* routing.claude.stopAll();

      const remaining = yield* provider.listSessions();
      assert.equal(remaining.length, 0);
    }),
  );

  it.effect("persists runtime status transitions in provider_session_runtime", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const runtimeRepository = yield* ProviderSessionRuntime.ProviderSessionRuntimeRepository;

      const threadId = asThreadId("thread-runtime-status");
      const session = yield* provider.startSession(threadId, {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId,
        runtimeMode: "full-access",
      });
      yield* provider.sendTurn({
        threadId: session.threadId,
        input: "hello",
        attachments: [],
      });

      const runningRuntime = yield* runtimeRepository.getByThreadId({
        threadId: session.threadId,
      });
      assert.equal(Option.isSome(runningRuntime), true);
      if (Option.isSome(runningRuntime)) {
        assert.equal(runningRuntime.value.status, "running");
        assert.deepEqual(runningRuntime.value.resumeCursor, session.resumeCursor);
        const payload = runningRuntime.value.runtimePayload;
        assert.equal(payload !== null && typeof payload === "object", true);
        if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
          const runtimePayload = payload as {
            cwd: string;
            model: string | null;
            activeTurnId: string | null;
            lastError: string | null;
            lastRuntimeEvent: string | null;
          };
          assert.equal(runtimePayload.cwd, session.cwd);
          assert.equal(runtimePayload.model, null);
          assert.equal(runtimePayload.activeTurnId, `turn-${String(session.threadId)}`);
          assert.equal(runtimePayload.lastError, null);
          assert.equal(runtimePayload.lastRuntimeEvent, "provider.sendTurn");
        }
      }
    }),
  );

  it.effect("reuses persisted resume cursor when startSession is called after a restart", () =>
    Effect.gen(function* () {
      const tempDir = NodeFS.mkdtempSync(
        NodePath.join(NodeOS.tmpdir(), "t3-provider-service-start-"),
      );
      const dbPath = NodePath.join(tempDir, "orchestration.sqlite");
      const persistenceLayer = makeSqlitePersistenceLive(dbPath);
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(persistenceLayer),
      );

      const firstClaude = makeFakeCodexAdapter(CLAUDE_AGENT_DRIVER);
      const firstRegistry = makeAdapterRegistryMock({
        [ProviderDriverKind.make("claudeAgent")]: firstClaude.adapter,
      });
      const firstDirectoryLayer = ProviderSessionDirectoryLive.pipe(
        Layer.provide(runtimeRepositoryLayer),
      );
      const firstProviderLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, firstRegistry),
        ),
        Layer.provide(firstDirectoryLayer),
        Layer.provide(defaultServerSettingsLayer),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      const initial = yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        return yield* provider.startSession(asThreadId("thread-claude-start"), {
          provider: ProviderDriverKind.make("claudeAgent"),
          providerInstanceId: claudeAgentInstanceId,
          threadId: asThreadId("thread-claude-start"),
          cwd: "/tmp/project-claude-start",
          runtimeMode: "full-access",
        });
      }).pipe(Effect.provide(firstProviderLayer));

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        yield* provider.listSessions();
      }).pipe(Effect.provide(firstProviderLayer));

      const secondClaude = makeFakeCodexAdapter(CLAUDE_AGENT_DRIVER);
      const secondRegistry = makeAdapterRegistryMock({
        [ProviderDriverKind.make("claudeAgent")]: secondClaude.adapter,
      });
      const secondDirectoryLayer = ProviderSessionDirectoryLive.pipe(
        Layer.provide(runtimeRepositoryLayer),
      );
      const secondProviderLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, secondRegistry),
        ),
        Layer.provide(secondDirectoryLayer),
        Layer.provide(defaultServerSettingsLayer),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      secondClaude.startSession.mockClear();

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        yield* provider.startSession(initial.threadId, {
          provider: ProviderDriverKind.make("claudeAgent"),
          providerInstanceId: claudeAgentInstanceId,
          threadId: initial.threadId,
          cwd: "/tmp/project-claude-start",
          runtimeMode: "full-access",
        });
      }).pipe(Effect.provide(secondProviderLayer));

      assert.equal(secondClaude.startSession.mock.calls.length, 1);
      const resumedStartInput = secondClaude.startSession.mock.calls[0]?.[0];
      assert.equal(typeof resumedStartInput === "object" && resumedStartInput !== null, true);
      if (resumedStartInput && typeof resumedStartInput === "object") {
        const startPayload = resumedStartInput as {
          provider?: string;
          cwd?: string;
          resumeCursor?: unknown;
          threadId?: string;
        };
        assert.equal(startPayload.provider, "claudeAgent");
        assert.equal(startPayload.cwd, "/tmp/project-claude-start");
        assert.deepEqual(startPayload.resumeCursor, initial.resumeCursor);
        assert.equal(startPayload.threadId, initial.threadId);
      }

      NodeFS.rmSync(tempDir, { recursive: true, force: true });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "reuses persisted cwd when startSession resumes a claude session without cwd input",
    () =>
      Effect.gen(function* () {
        const tempDir = NodeFS.mkdtempSync(
          NodePath.join(NodeOS.tmpdir(), "t3-provider-service-cwd-"),
        );
        const dbPath = NodePath.join(tempDir, "orchestration.sqlite");
        const persistenceLayer = makeSqlitePersistenceLive(dbPath);
        const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
          Layer.provide(persistenceLayer),
        );

        const firstClaude = makeFakeCodexAdapter(CLAUDE_AGENT_DRIVER);
        const firstRegistry = makeAdapterRegistryMock({
          [ProviderDriverKind.make("claudeAgent")]: firstClaude.adapter,
        });
        const firstDirectoryLayer = ProviderSessionDirectoryLive.pipe(
          Layer.provide(runtimeRepositoryLayer),
        );
        const firstProviderLayer = makeProviderServiceLive().pipe(
          Layer.provide(
            Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, firstRegistry),
          ),
          Layer.provide(firstDirectoryLayer),
          Layer.provide(defaultServerSettingsLayer),
          Layer.provide(serverConfigTestLayer),
          Layer.provide(AnalyticsService.layerTest),
          Layer.provide(
            Layer.succeed(
              ProviderEventLoggers.ProviderEventLoggers,
              ProviderEventLoggers.NoOpProviderEventLoggers,
            ),
          ),
        );

        const initial = yield* Effect.gen(function* () {
          const provider = yield* ProviderService.ProviderService;
          return yield* provider.startSession(asThreadId("thread-claude-cwd"), {
            provider: ProviderDriverKind.make("claudeAgent"),
            providerInstanceId: claudeAgentInstanceId,
            threadId: asThreadId("thread-claude-cwd"),
            cwd: "/tmp/project-claude-cwd",
            runtimeMode: "full-access",
          });
        }).pipe(Effect.provide(firstProviderLayer));

        const secondClaude = makeFakeCodexAdapter(CLAUDE_AGENT_DRIVER);
        const secondRegistry = makeAdapterRegistryMock({
          [ProviderDriverKind.make("claudeAgent")]: secondClaude.adapter,
        });
        const secondDirectoryLayer = ProviderSessionDirectoryLive.pipe(
          Layer.provide(runtimeRepositoryLayer),
        );
        const secondProviderLayer = makeProviderServiceLive().pipe(
          Layer.provide(
            Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, secondRegistry),
          ),
          Layer.provide(secondDirectoryLayer),
          Layer.provide(defaultServerSettingsLayer),
          Layer.provide(serverConfigTestLayer),
          Layer.provide(AnalyticsService.layerTest),
          Layer.provide(
            Layer.succeed(
              ProviderEventLoggers.ProviderEventLoggers,
              ProviderEventLoggers.NoOpProviderEventLoggers,
            ),
          ),
        );

        secondClaude.startSession.mockClear();

        yield* Effect.gen(function* () {
          const provider = yield* ProviderService.ProviderService;
          yield* provider.startSession(initial.threadId, {
            provider: ProviderDriverKind.make("claudeAgent"),
            providerInstanceId: claudeAgentInstanceId,
            threadId: initial.threadId,
            runtimeMode: "full-access",
          });
        }).pipe(Effect.provide(secondProviderLayer));

        assert.equal(secondClaude.startSession.mock.calls.length, 1);
        const resumedStartInput = secondClaude.startSession.mock.calls[0]?.[0];
        assert.equal(typeof resumedStartInput === "object" && resumedStartInput !== null, true);
        if (resumedStartInput && typeof resumedStartInput === "object") {
          const startPayload = resumedStartInput as {
            provider?: string;
            cwd?: string;
            resumeCursor?: unknown;
            threadId?: string;
          };
          assert.equal(startPayload.provider, "claudeAgent");
          assert.equal(startPayload.cwd, "/tmp/project-claude-cwd");
          assert.deepEqual(startPayload.resumeCursor, initial.resumeCursor);
          assert.equal(startPayload.threadId, initial.threadId);
        }

        NodeFS.rmSync(tempDir, { recursive: true, force: true });
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});

const fanout = makeProviderServiceLayer();
fanout.layer("ProviderServiceLive fanout", (it) => {
  it.effect("fans out adapter turn completion events", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const session = yield* provider.startSession(asThreadId("thread-1"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-1"),
        runtimeMode: "full-access",
      });

      const eventsRef = yield* Ref.make<Array<ProviderRuntimeEvent>>([]);
      const consumer = yield* Stream.runForEach(provider.streamEvents, (event) =>
        Ref.update(eventsRef, (current) => [...current, event]),
      ).pipe(Effect.forkChild);
      yield* advanceTestClock(50);

      const completedEvent: LegacyProviderRuntimeEvent = {
        type: "turn.completed",
        eventId: asEventId("evt-1"),
        provider: ProviderDriverKind.make("codex"),
        createdAt: "2026-01-01T00:00:00.000Z",
        threadId: session.threadId,
        turnId: asTurnId("turn-1"),
        status: "completed",
      };

      fanout.codex.emit(completedEvent);
      yield* advanceTestClock(50);

      const events = yield* Ref.get(eventsRef);
      yield* Fiber.interrupt(consumer);

      assert.equal(
        events.some((entry) => entry.type === "turn.completed"),
        true,
      );
      assert.equal(
        events.some(
          (entry) =>
            entry.type === "turn.completed" && entry.providerInstanceId === codexInstanceId,
        ),
        true,
      );
    }),
  );

  it.effect("fans out canonical runtime events in emission order", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const session = yield* provider.startSession(asThreadId("thread-seq"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-seq"),
        runtimeMode: "full-access",
      });

      const receivedRef = yield* Ref.make<Array<ProviderRuntimeEvent>>([]);
      const consumer = yield* Stream.take(provider.streamEvents, 3).pipe(
        Stream.runForEach((event) => Ref.update(receivedRef, (current) => [...current, event])),
        Effect.forkChild,
      );
      yield* advanceTestClock(50);

      fanout.codex.emit({
        type: "tool.started",
        eventId: asEventId("evt-seq-1"),
        provider: ProviderDriverKind.make("codex"),
        createdAt: "2026-01-01T00:00:00.000Z",
        threadId: session.threadId,
        turnId: asTurnId("turn-1"),
        toolKind: "command",
        title: "Ran command",
      });
      fanout.codex.emit({
        type: "tool.completed",
        eventId: asEventId("evt-seq-2"),
        provider: ProviderDriverKind.make("codex"),
        createdAt: "2026-01-01T00:00:00.000Z",
        threadId: session.threadId,
        turnId: asTurnId("turn-1"),
        toolKind: "command",
        title: "Ran command",
      });
      fanout.codex.emit({
        type: "turn.completed",
        eventId: asEventId("evt-seq-3"),
        provider: ProviderDriverKind.make("codex"),
        createdAt: "2026-01-01T00:00:00.000Z",
        threadId: session.threadId,
        turnId: asTurnId("turn-1"),
        status: "completed",
      });

      yield* Fiber.join(consumer);
      const received = yield* Ref.get(receivedRef);
      assert.deepEqual(
        received.map((event) => event.eventId),
        [asEventId("evt-seq-1"), asEventId("evt-seq-2"), asEventId("evt-seq-3")],
      );
    }),
  );

  it.effect("keeps subscriber delivery ordered and isolates failing subscribers", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const session = yield* provider.startSession(asThreadId("thread-1"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-1"),
        runtimeMode: "full-access",
      });

      const receivedByHealthy: string[] = [];
      const expectedEventIds = new Set<string>(["evt-ordered-1", "evt-ordered-2", "evt-ordered-3"]);
      const healthyFiber = yield* Stream.take(provider.streamEvents, 3).pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            receivedByHealthy.push(event.eventId);
          }),
        ),
        Effect.forkChild,
      );
      const failingFiber = yield* Stream.take(provider.streamEvents, 1).pipe(
        Stream.runForEach(() => Effect.fail("listener crash")),
        Effect.forkChild,
      );
      yield* advanceTestClock(50);

      const events: ReadonlyArray<LegacyProviderRuntimeEvent> = [
        {
          type: "tool.completed",
          eventId: asEventId("evt-ordered-1"),
          provider: ProviderDriverKind.make("codex"),
          createdAt: "2026-01-01T00:00:00.000Z",
          threadId: session.threadId,
          turnId: asTurnId("turn-1"),
          toolKind: "command",
          title: "Ran command",
          detail: "echo one",
        },
        {
          type: "message.delta",
          eventId: asEventId("evt-ordered-2"),
          provider: ProviderDriverKind.make("codex"),
          createdAt: "2026-01-01T00:00:00.000Z",
          threadId: session.threadId,
          turnId: asTurnId("turn-1"),
          delta: "hello",
        },
        {
          type: "turn.completed",
          eventId: asEventId("evt-ordered-3"),
          provider: ProviderDriverKind.make("codex"),
          createdAt: "2026-01-01T00:00:00.000Z",
          threadId: session.threadId,
          turnId: asTurnId("turn-1"),
          status: "completed",
        },
      ];

      for (const event of events) {
        fanout.codex.emit(event);
      }
      const failingResult = yield* Effect.result(Fiber.join(failingFiber));
      assert.equal(failingResult._tag, "Failure");
      yield* Fiber.join(healthyFiber);

      assert.deepEqual(
        receivedByHealthy.filter((eventId) => expectedEventIds.has(eventId)).slice(0, 3),
        ["evt-ordered-1", "evt-ordered-2", "evt-ordered-3"],
      );
    }),
  );

  it.effect("records provider metrics with the routed provider label", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      const session = yield* provider.startSession(asThreadId("thread-metrics"), {
        provider: ProviderDriverKind.make("claudeAgent"),
        providerInstanceId: claudeAgentInstanceId,
        threadId: asThreadId("thread-metrics"),
        cwd: "/tmp/project",
        runtimeMode: "full-access",
      });

      yield* provider.interruptTurn({ threadId: session.threadId });
      yield* provider.respondToRequest({
        threadId: session.threadId,
        requestId: asRequestId("req-metrics-1"),
        decision: "accept",
      });
      yield* provider.respondToUserInput({
        threadId: session.threadId,
        requestId: asRequestId("req-metrics-2"),
        answers: {
          sandbox_mode: "workspace-write",
        },
      });
      yield* provider.rollbackConversation({
        threadId: session.threadId,
        numTurns: 1,
      });
      yield* provider.stopSession({ threadId: session.threadId });

      const snapshots = yield* Metric.snapshot;

      assert.equal(
        hasMetricSnapshot(snapshots, "t3_provider_turns_total", {
          provider: ProviderDriverKind.make("claudeAgent"),
          operation: "interrupt",
          outcome: "success",
        }),
        true,
      );
      assert.equal(
        hasMetricSnapshot(snapshots, "t3_provider_turns_total", {
          provider: ProviderDriverKind.make("claudeAgent"),
          operation: "approval-response",
          outcome: "success",
        }),
        true,
      );
      assert.equal(
        hasMetricSnapshot(snapshots, "t3_provider_turns_total", {
          provider: ProviderDriverKind.make("claudeAgent"),
          operation: "user-input-response",
          outcome: "success",
        }),
        true,
      );
      assert.equal(
        hasMetricSnapshot(snapshots, "t3_provider_turns_total", {
          provider: ProviderDriverKind.make("claudeAgent"),
          operation: "rollback",
          outcome: "success",
        }),
        true,
      );
      assert.equal(
        hasMetricSnapshot(snapshots, "t3_provider_sessions_total", {
          provider: ProviderDriverKind.make("claudeAgent"),
          operation: "stop",
          outcome: "success",
        }),
        true,
      );
    }),
  );

  it.effect(
    "records sendTurn metrics with the resolved provider when modelSelection is omitted",
    () =>
      Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;

        const session = yield* provider.startSession(asThreadId("thread-send-metrics"), {
          provider: ProviderDriverKind.make("claudeAgent"),
          providerInstanceId: claudeAgentInstanceId,
          threadId: asThreadId("thread-send-metrics"),
          cwd: "/tmp/project-send-metrics",
          runtimeMode: "full-access",
        });

        yield* provider.sendTurn({
          threadId: session.threadId,
          input: "hello",
          attachments: [],
        });

        const snapshots = yield* Metric.snapshot;

        assert.equal(
          hasMetricSnapshot(snapshots, "t3_provider_turns_total", {
            provider: ProviderDriverKind.make("claudeAgent"),
            operation: "send",
            outcome: "success",
          }),
          true,
        );
        assert.equal(
          hasMetricSnapshot(snapshots, "t3_provider_turn_duration", {
            provider: ProviderDriverKind.make("claudeAgent"),
            operation: "send",
          }),
          true,
        );
      }),
  );
});

const validation = makeProviderServiceLayer();
validation.layer("ProviderServiceLive validation", (it) => {
  it.effect("rejects session starts without an explicit provider instance id", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      validation.codex.startSession.mockClear();
      const failure = yield* Effect.flip(
        provider.startSession(asThreadId("thread-missing-instance-id"), {
          provider: ProviderDriverKind.make("codex"),
          threadId: asThreadId("thread-missing-instance-id"),
          runtimeMode: "full-access",
        }),
      );

      assert.instanceOf(failure, ProviderValidationError);
      assert.include(failure.issue, "Provider instance id is required for provider 'codex'.");
      assert.equal(validation.codex.startSession.mock.calls.length, 0);
    }),
  );

  it.effect("rejects mismatched provider kind and provider instance id", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      validation.codex.startSession.mockClear();
      validation.claude.startSession.mockClear();
      const failure = yield* Effect.flip(
        provider.startSession(asThreadId("thread-instance-mismatch"), {
          provider: ProviderDriverKind.make("codex"),
          providerInstanceId: claudeAgentInstanceId,
          threadId: asThreadId("thread-instance-mismatch"),
          runtimeMode: "full-access",
        }),
      );

      assert.instanceOf(failure, ProviderValidationError);
      assert.include(
        failure.issue,
        "Provider instance 'claudeAgent' belongs to driver 'claudeAgent', not 'codex'.",
      );
      assert.equal(validation.codex.startSession.mock.calls.length, 0);
      assert.equal(validation.claude.startSession.mock.calls.length, 0);
    }),
  );

  it.effect("returns ProviderValidationError for invalid input payloads", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      const failure = yield* Effect.result(
        provider.startSession(asThreadId("thread-validation"), {
          threadId: asThreadId("thread-validation"),
          provider: "invalid-provider",
          runtimeMode: "full-access",
        } as never),
      );

      assert.equal(failure._tag, "Failure");
      if (failure._tag !== "Failure") {
        return;
      }
      assert.equal(failure.failure._tag, "ProviderValidationError");
      if (failure.failure._tag !== "ProviderValidationError") {
        return;
      }
      assert.equal(failure.failure.operation, "ProviderService.startSession");
      assert.equal(failure.failure.issue.includes("invalid-provider"), true);
    }),
  );

  it.effect("accepts startSession when adapter has not emitted provider thread id yet", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const runtimeRepository = yield* ProviderSessionRuntime.ProviderSessionRuntimeRepository;

      validation.codex.startSession.mockImplementationOnce((input: ProviderSessionStartInput) =>
        Effect.sync(() => {
          const now = "2026-01-01T00:00:00.000Z";
          return {
            provider: ProviderDriverKind.make("codex"),
            status: "ready",
            threadId: input.threadId,
            runtimeMode: input.runtimeMode,
            cwd: input.cwd ?? process.cwd(),
            createdAt: now,
            updatedAt: now,
          } satisfies ProviderSession;
        }),
      );

      const session = yield* provider.startSession(asThreadId("thread-missing"), {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: codexInstanceId,
        threadId: asThreadId("thread-missing"),
        cwd: "/tmp/project",
        runtimeMode: "full-access",
      });

      assert.equal(session.threadId, asThreadId("thread-missing"));

      const runtime = yield* runtimeRepository.getByThreadId({
        threadId: session.threadId,
      });
      assert.equal(Option.isSome(runtime), true);
      if (Option.isSome(runtime)) {
        assert.equal(runtime.value.threadId, session.threadId);
      }
    }),
  );
});

describe("agent browser access", () => {
  const revokedThreads: Array<ThreadId> = [];

  const startSessionWith = (enableAgentBrowserAccess: boolean, threadId: ThreadId) =>
    Effect.gen(function* () {
      const issued: Array<ThreadId> = [];
      const codex = makeFakeCodexAdapter();
      const providerAdapterLayer = Layer.succeed(
        ProviderAdapterRegistry.ProviderAdapterRegistry,
        makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
      );
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const directoryLayer = ProviderSessionDirectoryLive.pipe(
        Layer.provide(runtimeRepositoryLayer),
      );
      const providerLayer = makeProviderServiceLive({
        issueMcpCredential: (request) =>
          Effect.sync(() => {
            issued.push(request.threadId);
            return undefined;
          }),
        revokeMcpCredential: (revoked) => Effect.sync(() => void revokedThreads.push(revoked)),
      }).pipe(
        Layer.provide(providerAdapterLayer),
        Layer.provide(directoryLayer),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({ enableAgentBrowserAccess })),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        return yield* provider.startSession(threadId, {
          provider: CODEX_DRIVER,
          providerInstanceId: codexInstanceId,
          threadId,
          runtimeMode: "full-access",
        });
      }).pipe(Effect.provide(providerLayer));

      return issued;
    });

  // Credential issuance is the observable that matters: it is the only place a
  // credential is minted, and `/mcp` accepts nothing else, so withholding it is
  // what actually denies every provider and external MCP client.
  it.effect("requests no MCP credential when agent browser access is off", () =>
    Effect.gen(function* () {
      const issued = yield* startSessionWith(false, asThreadId("thread-browser-off"));

      assert.deepEqual(issued, []);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("revokes an already-issued credential when access is off", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-browser-revoke");
      revokedThreads.length = 0;

      yield* startSessionWith(false, threadId);

      // Clearing the in-memory map is not enough: a token issued before the
      // toggle flipped stays valid against `/mcp` for its whole liveness
      // window, and later turns refresh it.
      assert.deepEqual(revokedThreads, [threadId]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("requests an MCP credential when agent browser access is on", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-browser-on");

      const issued = yield* startSessionWith(true, threadId);

      assert.deepEqual(issued, [threadId]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("MCP credential continuity", () => {
  const fakeHttpServer = HttpServer.HttpServer.of({
    address: { _tag: "TcpAddress", hostname: "127.0.0.1", port: 43123 },
    serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
  });
  const fakeServerEnvironment = ServerEnvironment.ServerEnvironment.of({
    getEnvironmentId: Effect.succeed(EnvironmentId.make("environment-continuity")),
    getDescriptor: Effect.die("unused"),
  });
  const registryLayer = McpSessionRegistry.layer.pipe(
    Layer.provide(Layer.succeed(HttpServer.HttpServer, fakeHttpServer)),
    Layer.provide(Layer.succeed(ServerEnvironment.ServerEnvironment, fakeServerEnvironment)),
    Layer.provide(NodeServices.layer),
  );

  // The agent is handed its bearer once, when its session starts. A second
  // `startSession` that mints a new one revokes the old one and has nowhere to
  // deliver the replacement — the pack drivers keep their live session and drop
  // the `mcp` config a restart carries — so every later `/mcp` call 401s for
  // the rest of the thread's life. That is the incident this guards.
  it.effect("does not rotate the bearer a live thread's agent already holds", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-mcp-continuity");
      const claims: Array<ThreadId> = [];
      const codex = makeFakeCodexAdapter();
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const providerLayer = makeProviderServiceLive({
        issueMcpCredential: (request) =>
          Effect.sync(() => void claims.push(request.threadId)).pipe(
            Effect.andThen(McpCredentialContinuity.claimThreadMcpCredential(request)),
          ),
      }).pipe(
        Layer.provide(
          Layer.succeed(
            ProviderAdapterRegistry.ProviderAdapterRegistry,
            makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
          ),
        ),
        Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const start = () =>
          provider.startSession(threadId, {
            provider: CODEX_DRIVER,
            providerInstanceId: codexInstanceId,
            threadId,
            runtimeMode: "full-access",
          });
        yield* start();
        const first = McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader;
        assert.equal(typeof first, "string");

        // Restarting the session for a runtime-mode / cwd / model change.
        yield* start();
        const second = McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader;

        // The re-prepare still asks — it must, or the browser-access gate
        // would stop being consulted — but it comes back with the credential
        // the agent already has rather than a replacement it cannot receive.
        assert.equal(claims.length, 2);
        assert.equal(second, first);

        // The token the agent holds still resolves after the restart.
        const registry = yield* McpSessionRegistry.McpSessionRegistry;
        const token = (first ?? "").replace(/^Bearer\s+/, "");
        assert.equal((yield* registry.resolve(token))?.threadId, threadId);

        McpProviderSession.clearMcpProviderSession(threadId);
      }).pipe(Effect.provide(providerLayer));
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );

  // A stop that fails is still a stop that ran. The adapter may have torn the
  // runtime down, or half torn it down, before it failed — and `Effect`
  // short-circuits, so a withdrawal placed after that call is simply skipped.
  // What survives is a bearer that still resolves against `/mcp` and an epoch
  // that never moved, which keeps the driver's recovery hook alive as well.
  // Withdrawing first is not the mirror image: a credential revoked before a
  // stop that then fails is merely unavailable to a session that may still be
  // running, and it is told exactly that.
  it.effect("withdraws the thread's credential even when the adapter's stop fails", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-mcp-stop-failure");
      const codex = makeFakeCodexAdapter();
      codex.stopSession.mockImplementation(() =>
        Effect.fail(
          new ProviderAdapterRequestError({
            provider: String(CODEX_DRIVER),
            method: "stopSession",
            detail: "simulated stopSession failure",
          }),
        ),
      );
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(
            ProviderAdapterRegistry.ProviderAdapterRegistry,
            makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
          ),
        ),
        Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const registry = yield* McpSessionRegistry.McpSessionRegistry;
        yield* provider.startSession(threadId, {
          provider: CODEX_DRIVER,
          providerInstanceId: codexInstanceId,
          threadId,
          runtimeMode: "full-access",
        });
        const token = (
          McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader ?? ""
        ).replace(/^Bearer\s+/, "");
        assert.equal((yield* registry.resolve(token))?.threadId, threadId);
        const epoch = yield* registry.withdrawalCount(threadId);

        const exit = yield* provider.stopSession({ threadId }).pipe(Effect.exit);
        assert.equal(Exit.isFailure(exit), true);
        assert.equal(codex.stopSession.mock.calls.length, 1);

        // The failure is reported, and the credential is gone anyway.
        assert.equal(yield* registry.resolve(token), undefined);
        // Advanced, not advanced exactly once: a stop withdraws before the
        // shutdown and again on the way out, so the count is not the property
        // — every authority stamped before this stop being retired is.
        assert.equal((yield* registry.withdrawalCount(threadId)) > epoch, true);
        assert.equal(McpProviderSession.readMcpProviderSession(threadId), undefined);
      }).pipe(Effect.provide(providerLayer));
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );

  // The other half of the same failure, and the reason the withdrawal cannot
  // simply be moved in front of the shutdown and left there. The runtime
  // survives its failed stop and keeps answering `hasSession`, so routing
  // would hand the next turn straight back to it — and a turn can only
  // `touch` a credential record that still exists, never recreate the one the
  // stop deleted. That thread would 401 for the rest of its life, which is the
  // exact incident this whole mechanism exists to prevent. An ordinary next
  // turn has to recover; needing a full restart is not good enough.
  it.effect("an ordinary next turn recovers from a stop whose shutdown failed", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-mcp-stop-failure-next-turn");
      const codex = makeFakeCodexAdapter();
      codex.stopSession.mockImplementation(() =>
        Effect.fail(
          new ProviderAdapterRequestError({
            provider: String(CODEX_DRIVER),
            method: "stopSession",
            detail: "simulated stopSession failure",
          }),
        ),
      );
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(
            ProviderAdapterRegistry.ProviderAdapterRegistry,
            makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
          ),
        ),
        Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const registry = yield* McpSessionRegistry.McpSessionRegistry;
        yield* provider.startSession(threadId, {
          provider: CODEX_DRIVER,
          providerInstanceId: codexInstanceId,
          threadId,
          runtimeMode: "full-access",
        });
        const before = McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader;

        const exit = yield* provider.stopSession({ threadId }).pipe(Effect.exit);
        assert.equal(Exit.isFailure(exit), true);
        // The runtime really did survive the failed stop: this is the state
        // the wedge needs, not a session that quietly went away.
        assert.equal(yield* codex.adapter.hasSession(threadId), true);
        assert.equal(McpProviderSession.readMcpProviderSession(threadId), undefined);

        // An ordinary turn. Not a restart.
        yield* provider.sendTurn({ threadId, input: "hello", attachments: [] });

        const after = McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader;
        assert.equal(typeof after, "string");
        assert.notEqual(after, before);
        // And it is a credential that actually works against `/mcp`.
        const token = (after ?? "").replace(/^Bearer\s+/, "");
        assert.equal((yield* registry.resolve(token))?.threadId, threadId);
        // The replacement was a new session, not the orphaned runtime adopted.
        assert.equal(codex.startSession.mock.calls.length, 2);

        McpProviderSession.clearMcpProviderSession(threadId);
      }).pipe(Effect.provide(providerLayer));
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );

  // The same heal, one step harder: a session that dies — or fails to stop —
  // before its first turn completes has never produced a resume cursor, and
  // the recovery path used to refuse outright ("no provider resume state is
  // persisted"). That is a dead end the user cannot act on, on a thread whose
  // messages are all still there. What is actually lost is the provider's
  // continuation, not the thread, so it starts fresh and says so.
  it.effect("a thread with nothing to resume from heals by starting fresh", () =>
    Effect.gen(function* () {
      {
        const threadId = asThreadId("thread-mcp-unresumable");
        const codex = makeFakeCodexAdapter();

        // A provider whose session never saved a point to continue from. The
        // original implementation still runs, so the adapter really does hold
        // the session; only the cursor it reports back is missing.
        const startWithCursor = codex.startSession.getMockImplementation();
        assert.equal(typeof startWithCursor, "function");
        codex.startSession.mockImplementation((sessionInput) =>
          (startWithCursor as NonNullable<typeof startWithCursor>)(sessionInput).pipe(
            Effect.map((session) => {
              const withoutCursor = { ...session };
              delete (withoutCursor as { resumeCursor?: unknown }).resumeCursor;
              return withoutCursor;
            }),
          ),
        );
        codex.stopSession.mockImplementation(() =>
          Effect.fail(
            new ProviderAdapterRequestError({
              provider: String(CODEX_DRIVER),
              method: "stopSession",
              detail: "simulated stopSession failure",
            }),
          ),
        );

        const recoveryStrategies: Array<unknown> = [];
        const recordingAnalytics = Layer.succeed(
          AnalyticsService.AnalyticsService,
          AnalyticsService.AnalyticsService.of({
            record: (event, properties) =>
              Effect.sync(() => {
                if (event === "provider.session.recovered") {
                  recoveryStrategies.push(
                    (properties as { strategy?: unknown } | undefined)?.strategy,
                  );
                }
              }),
            flush: Effect.void,
          }),
        );
        const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
          Layer.provide(SqlitePersistenceMemory),
        );
        const providerLayer = makeProviderServiceLive().pipe(
          Layer.provide(
            Layer.succeed(
              ProviderAdapterRegistry.ProviderAdapterRegistry,
              makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
            ),
          ),
          Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
          Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
          Layer.provide(serverConfigTestLayer),
          Layer.provide(recordingAnalytics),
          Layer.provide(
            Layer.succeed(
              ProviderEventLoggers.ProviderEventLoggers,
              ProviderEventLoggers.NoOpProviderEventLoggers,
            ),
          ),
        );

        yield* Effect.gen(function* () {
          const provider = yield* ProviderService.ProviderService;
          const registry = yield* McpSessionRegistry.McpSessionRegistry;
          yield* provider.startSession(threadId, {
            provider: CODEX_DRIVER,
            providerInstanceId: codexInstanceId,
            threadId,
            runtimeMode: "full-access",
          });
          const before = McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader;

          const exit = yield* provider.stopSession({ threadId }).pipe(Effect.exit);
          assert.equal(Exit.isFailure(exit), true);

          // Collect what the user would be shown while the turn runs.
          const warnings: Array<string> = [];
          const collector = yield* Stream.runForEach(provider.streamEvents, (event) =>
            Effect.sync(() => {
              if (event.type === "runtime.warning") warnings.push(event.payload.message);
            }),
          ).pipe(Effect.forkChild);
          yield* Effect.yieldNow;

          // The message the user just typed. It must land.
          yield* provider.sendTurn({ threadId, input: "hello", attachments: [] });
          assert.equal(codex.sendTurn.mock.calls.length, 1);

          yield* Effect.yieldNow;
          yield* Fiber.interrupt(collector);

          // A working credential, as in the resumable case.
          const after = McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader;
          assert.equal(typeof after, "string");
          assert.notEqual(after, before);
          const token = (after ?? "").replace(/^Bearer\s+/, "");
          assert.equal((yield* registry.resolve(token))?.threadId, threadId);

          // The user is told, in their own vocabulary, on the surface the work
          // log already renders — no thread id, no "resume cursor".
          assert.equal(
            warnings.some((message) => message.includes("without its earlier context")),
            true,
          );
          // And it is measurable, distinctly from an ordinary resume.
          assert.deepEqual(recoveryStrategies, ["fresh-start"]);

          McpProviderSession.clearMcpProviderSession(threadId);
        }).pipe(Effect.provide(providerLayer));
      }
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );

  // "Stop" asks for a state, not for an action: make it not be running. On a
  // runtime that is already gone that state holds, so the honest answer is
  // yes, not an error the user can do nothing with. Both sides matter — the
  // no-op is only for a runtime that demonstrably is not there, and an
  // interrupt against one that IS there must still fail loudly when it fails.
  it.effect("interrupting is a no-op when the runtime is gone, and still fails when it is not", () =>
    Effect.gen(function* () {
      const goneThreadId = asThreadId("thread-interrupt-runtime-gone");
      const liveThreadId = asThreadId("thread-interrupt-runtime-live");
      const codex = makeFakeCodexAdapter();

      // One thread's runtime went away without a clean stop, the way a crash
      // does; the other is still there.
      const realHasSession = codex.hasSession.getMockImplementation();
      assert.equal(typeof realHasSession, "function");
      codex.hasSession.mockImplementation((tid) =>
        tid === goneThreadId
          ? Effect.succeed(false)
          : (realHasSession as NonNullable<typeof realHasSession>)(tid),
      );

      const interruptedEvents: Array<string> = [];
      const recordingAnalytics = Layer.succeed(
        AnalyticsService.AnalyticsService,
        AnalyticsService.AnalyticsService.of({
          record: (event) =>
            Effect.sync(() => {
              if (event === "provider.turn.interrupted") interruptedEvents.push(event);
            }),
          flush: Effect.void,
        }),
      );
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(
            ProviderAdapterRegistry.ProviderAdapterRegistry,
            makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
          ),
        ),
        Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(recordingAnalytics),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const start = (threadId: ThreadId) =>
          provider.startSession(threadId, {
            provider: CODEX_DRIVER,
            providerInstanceId: codexInstanceId,
            threadId,
            runtimeMode: "full-access",
          });
        yield* start(goneThreadId);
        yield* start(liveThreadId);
        const startCallsBefore = codex.startSession.mock.calls.length;

        // Side one: nothing is running, so the answer is yes.
        yield* provider.interruptTurn({ threadId: goneThreadId });
        // Honestly vacuous — no agent spawned to interrupt...
        assert.equal(codex.startSession.mock.calls.length, startCallsBefore);
        assert.equal(codex.interruptTurn.mock.calls.length, 0);
        // ...and nothing claimed a turn was interrupted, because none was.
        assert.deepEqual(interruptedEvents, []);

        // Side two: a runtime that is there and genuinely fails to interrupt.
        // The no-op must not have turned into a blanket "interrupt succeeds".
        codex.interruptTurn.mockImplementation(() =>
          Effect.fail(
            new ProviderAdapterRequestError({
              provider: String(CODEX_DRIVER),
              method: "interruptTurn",
              detail: "simulated interrupt failure",
            }),
          ),
        );
        const exit = yield* provider.interruptTurn({ threadId: liveThreadId }).pipe(Effect.exit);
        assert.equal(Exit.isFailure(exit), true);
        assert.equal(codex.interruptTurn.mock.calls.length, 1);

        McpProviderSession.clearMcpProviderSession(goneThreadId);
        McpProviderSession.clearMcpProviderSession(liveThreadId);
      }).pipe(Effect.provide(providerLayer));
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );

  // The boundary of the fresh-start heal, pinned on an operation that a fresh
  // runtime genuinely cannot serve. Answering a question means answering the
  // agent that asked it; spawning a new one that never asked would accept a
  // reply nobody is waiting for, which is worse than saying the request is
  // gone. It refuses — in words about the answer, not about a resume cursor.
  it.effect("answering a request a dead agent asked refuses, and says so plainly", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-mcp-unresumable-respond");
      const codex = makeFakeCodexAdapter();
      const startWithCursor = codex.startSession.getMockImplementation();
      assert.equal(typeof startWithCursor, "function");
      codex.startSession.mockImplementation((sessionInput) =>
        (startWithCursor as NonNullable<typeof startWithCursor>)(sessionInput).pipe(
          Effect.map((session) => {
            const withoutCursor = { ...session };
            delete (withoutCursor as { resumeCursor?: unknown }).resumeCursor;
            return withoutCursor;
          }),
        ),
      );
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(
            ProviderAdapterRegistry.ProviderAdapterRegistry,
            makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
          ),
        ),
        Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        yield* provider.startSession(threadId, {
          provider: CODEX_DRIVER,
          providerInstanceId: codexInstanceId,
          threadId,
          runtimeMode: "full-access",
        });
        codex.hasSession.mockImplementation(() => Effect.succeed(false));
        const startCallsBefore = codex.startSession.mock.calls.length;

        const exit = yield* provider
          .respondToRequest({ threadId, requestId: asRequestId("req-gone"), decision: "accept" })
          .pipe(Effect.exit);

        assert.equal(Exit.isFailure(exit), true);
        // It refused rather than quietly starting an agent nobody asked for.
        assert.equal(codex.startSession.mock.calls.length, startCallsBefore);
        // And in the user's vocabulary: about their answer, not about internals.
        const failure = Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : "";
        assert.equal(failure.includes("your answer could not be delivered"), true);
        assert.equal(failure.includes("resume"), false);
        assert.equal(failure.includes(String(threadId)), false);

        McpProviderSession.clearMcpProviderSession(threadId);
      }).pipe(Effect.provide(providerLayer));
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );

  // The orphan marker's core invariant is "nothing routes work into this
  // runtime". `stopSession` was not its only caller that skips recovery —
  // `uploadFeedback` probes with `allowRecovery: false` first — and reporting
  // a present-but-orphaned runtime as active let that probe call straight into
  // the runtime the marker exists to keep everyone away from.
  it.effect("an orphaned runtime is not reachable through a non-recovering caller", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-orphan-upload-feedback");
      const codex = makeFakeCodexAdapter();
      codex.stopSession.mockImplementation(() =>
        Effect.fail(
          new ProviderAdapterRequestError({
            provider: String(CODEX_DRIVER),
            method: "stopSession",
            detail: "simulated stopSession failure",
          }),
        ),
      );
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(
            ProviderAdapterRegistry.ProviderAdapterRegistry,
            makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
          ),
        ),
        Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const registry = yield* McpSessionRegistry.McpSessionRegistry;
        yield* provider.startSession(threadId, {
          provider: CODEX_DRIVER,
          providerInstanceId: codexInstanceId,
          threadId,
          runtimeMode: "full-access",
        });

        // Orphan it: the shutdown fails, so the runtime survives with a
        // credential this host has already withdrawn.
        const stopExit = yield* provider.stopSession({ threadId }).pipe(Effect.exit);
        assert.equal(Exit.isFailure(stopExit), true);
        assert.equal(yield* codex.adapter.hasSession(threadId), true);
        const startCallsBefore = codex.startSession.mock.calls.length;

        yield* provider.uploadFeedback({ threadId, reason: "looks good" });

        // It went through a replacement rather than the orphan...
        assert.equal(codex.startSession.mock.calls.length, startCallsBefore + 1);
        // ...so the thread ends holding a credential that actually works,
        // which an orphan-served upload would have left untrue.
        const stored = McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader;
        assert.equal(typeof stored, "string");
        assert.equal(
          (yield* registry.resolve((stored ?? "").replace(/^Bearer\s+/, "")))?.threadId,
          threadId,
        );

        McpProviderSession.clearMcpProviderSession(threadId);
      }).pipe(Effect.provide(providerLayer));
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );

  // The operations that reach the provider while holding the thread's permit
  // do so over transports that apply no deadline: Codex's `client.request` is
  // a bare `Deferred.await`, and OpenCode's SDK installs a fetch that sets
  // `req.timeout = false`. A provider that stops answering would therefore
  // hold the permit for the life of the process, and every later start, stop,
  // interrupt and turn on that thread would queue behind it. The bound is
  // host-side and deliberately not "move the call out of the permit" — outside
  // it, the operation would be routed against one runtime and delivered to
  // another.
  it.effect("a provider that never answers cannot wedge the thread", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-unbounded-rpc");
      const codex = makeFakeCodexAdapter();
      // A reply that never comes back, the way a hung provider process looks.
      codex.respondToRequest.mockImplementation(() => Effect.never);

      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(
            ProviderAdapterRegistry.ProviderAdapterRegistry,
            makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
          ),
        ),
        Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        yield* provider.startSession(threadId, {
          provider: CODEX_DRIVER,
          providerInstanceId: codexInstanceId,
          threadId,
          runtimeMode: "full-access",
        });

        const answering = yield* provider
          .respondToRequest({
            threadId,
            requestId: asRequestId("req-hung"),
            decision: "accept",
          })
          .pipe(Effect.exit, Effect.forkChild);

        // Past the approval-reply bound. Without one this fiber never settles.
        yield* advanceTestClock(15_001);
        const answered = yield* Fiber.join(answering);

        assert.equal(Exit.isFailure(answered), true);
        const failure = Exit.isFailure(answered) ? String(Cause.squash(answered.cause)) : "";
        assert.equal(failure.includes("stopped answering"), true);
        // It must NOT claim the operation did not happen: giving up on the
        // wait interrupts only the local Effect and establishes nothing about
        // what the provider did with the request.
        assert.equal(failure.includes("may still have been carried out"), true);

        // And the thread is usable afterwards: the permit came back, so a stop
        // does not queue behind a provider that is never going to reply.
        const stopped = yield* provider
          .stopSession({ threadId })
          .pipe(Effect.exit, Effect.timeoutOption("2 seconds"));
        assert.equal(Option.isSome(stopped), true, "the hung reply held the thread's permit");

        McpProviderSession.clearMcpProviderSession(threadId);
      }).pipe(Effect.provide(providerLayer));
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );

  // `adapter.sendTurn` is a dispatch on some providers and the whole turn on
  // others: Claude queues the prompt and returns, OpenCode awaits only the
  // submit, but Cursor — and every ACP provider sharing that adapter — awaits
  // `acp.prompt` to completion and emits `turn.completed` before returning.
  // So the thread's permit must NOT be held across it. Held, the only two ways
  // a user can call off a running agent, interrupt and stop, would queue
  // behind the turn they are meant to end.
  //
  // The cost of not holding it is disclosed and narrow: between routing and
  // dispatch, a replacement could take the prompt. The bookkeeping does not
  // follow it there — that is taken back under the permit — but the prompt can.
  it.effect("an in-flight turn does not block calling the agent off", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-route-then-deliver");
      const codex = makeFakeCodexAdapter();

      // Park *after* routing, inside the adapter call — the span the permit
      // either covers or does not. Parking inside routing would prove nothing:
      // routing is under the permit in both shapes.
      const enteredSend = yield* Deferred.make<void>();
      const releaseSend = yield* Deferred.make<void>();
      // Which runtime the turn actually lands on, sampled after the concurrent
      // start has had its chance rather than before it.
      const deliveredTo: Array<string> = [];
      const realSendTurn = codex.sendTurn.getMockImplementation();
      assert.equal(typeof realSendTurn, "function");
      codex.sendTurn.mockImplementation((turnInput) =>
        Effect.gen(function* () {
          yield* Deferred.succeed(enteredSend, undefined);
          yield* Deferred.await(releaseSend);
          const live = yield* codex.adapter.listSessions();
          const mine = live.find((session) => session.threadId === turnInput.threadId);
          const cursor = mine?.resumeCursor as { opaque?: unknown } | undefined;
          deliveredTo.push(String(cursor?.opaque ?? "none"));
          return yield* (realSendTurn as NonNullable<typeof realSendTurn>)(turnInput);
        }),
      );

      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(
            ProviderAdapterRegistry.ProviderAdapterRegistry,
            makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
          ),
        ),
        Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        // Runtime A, tagged so delivery is identifiable.
        yield* provider.startSession(threadId, {
          provider: CODEX_DRIVER,
          providerInstanceId: codexInstanceId,
          threadId,
          runtimeMode: "full-access",
          resumeCursor: { opaque: "runtime-A" },
        });

        const turnFiber = yield* provider
          .sendTurn({ threadId, input: "hello", attachments: [] })
          .pipe(Effect.exit, Effect.forkChild);
        // The turn has routed against runtime A and is now parked in the
        // adapter call, which is where the permit either still covers it or
        // has already been given back.
        yield* Deferred.await(enteredSend);

        // The user calls the agent off while the turn is still running. This
        // must complete now, not after the turn finishes: on Cursor and every
        // ACP provider, `adapter.sendTurn` awaits `acp.prompt` to completion,
        // so a permit held across it would make the interrupt queue behind the
        // very turn it is trying to stop — the agent would be unstoppable for
        // as long as it kept working.
        const interrupted = yield* provider
          .interruptTurn({ threadId })
          .pipe(Effect.exit, Effect.timeoutOption("2 seconds"));

        assert.equal(
          Option.isSome(interrupted),
          true,
          "an interrupt blocked behind an in-flight turn on the same thread",
        );
        assert.equal(codex.interruptTurn.mock.calls.length, 1);

        yield* Deferred.succeed(releaseSend, undefined);
        yield* Fiber.join(turnFiber);
        // The prompt itself still went to the runtime it was routed against —
        // nothing replaced it here. What this test pins is that calling the
        // agent off does not have to wait for it.
        assert.deepEqual(deliveredTo, ["runtime-A"]);

        // And the turn's bookkeeping did NOT run: the interrupt aborted the
        // very turn it describes. An armed watchdog here would never be
        // cleared — the adapter emits the turn's terminal event before
        // `sendTurn` returns, when the entry does not yet exist — so at its
        // deadline it would abort whatever turn the thread holds by then, and
        // on Claude-shaped adapters `interruptTurn` ignores the turn id and
        // closes the session outright.
        codex.interruptTurn.mock.calls.length = 0;
        yield* advanceTestClock(600_000);
        assert.deepEqual(
          codex.interruptTurn.mock.calls,
          [],
          "a watchdog armed for an already-aborted turn fired later",
        );

        McpProviderSession.clearMcpProviderSession(threadId);
      }).pipe(Effect.provide(providerLayer));
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );

  // The interleaving every sequential test misses, and the one that shipped an
  // authentication hole through five rounds.
  //
  // A stop withdraws its thread's credential, then calls the adapter. If a
  // start lands in that gap it publishes a NEW credential and a NEW runtime —
  // and the adapter is addressed by thread id, so the stop's shutdown then
  // tears down the *replacement* while the replacement's credential stays
  // valid against `/mcp`. Stop succeeded, so it never withdraws again.
  //
  // The assertion is the invariant rather than an ordering, because either
  // order is a legitimate outcome of a genuine race: whoever wins, the thread
  // must never end with a resolvable bearer and no runtime to own it.
  it.effect("a stop and a start racing never leave a credential without its runtime", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-stop-start-race");
      const codex = makeFakeCodexAdapter();

      // A shutdown we can hold open exactly where the hole is: after the stop
      // has withdrawn the credential, before the runtime is torn down.
      const enteredShutdown = yield* Deferred.make<void>();
      const releaseShutdown = yield* Deferred.make<void>();
      const realStop = codex.stopSession.getMockImplementation();
      assert.equal(typeof realStop, "function");
      codex.stopSession.mockImplementation((tid) =>
        Effect.gen(function* () {
          yield* Deferred.succeed(enteredShutdown, undefined);
          yield* Deferred.await(releaseShutdown);
          return yield* (realStop as NonNullable<typeof realStop>)(tid);
        }),
      );

      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(
            ProviderAdapterRegistry.ProviderAdapterRegistry,
            makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
          ),
        ),
        Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const registry = yield* McpSessionRegistry.McpSessionRegistry;
        const start = () =>
          provider.startSession(threadId, {
            provider: CODEX_DRIVER,
            providerInstanceId: codexInstanceId,
            threadId,
            runtimeMode: "full-access",
          });
        yield* start();

        const stopFiber = yield* provider.stopSession({ threadId }).pipe(Effect.exit, Effect.forkChild);
        // The stop is now parked inside the adapter, past its withdrawal.
        yield* Deferred.await(enteredShutdown);

        const startFiber = yield* start().pipe(Effect.exit, Effect.forkChild);
        // Give the start every chance to overtake. Unserialized it runs to
        // completion here; serialized it is parked on the thread's permit.
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;

        // The mechanism itself, not just its outcome: while a stop is parked
        // inside the adapter, a start for the same thread has not run. Without
        // the permit this is 2 — the start has already spawned the runtime the
        // parked shutdown is about to tear down.
        assert.equal(
          codex.startSession.mock.calls.length,
          1,
          "a start overtook a stop that was mid-shutdown on the same thread",
        );

        yield* Deferred.succeed(releaseShutdown, undefined);
        yield* Fiber.join(stopFiber);
        yield* Fiber.join(startFiber);

        // Whoever won, the two must agree.
        const runtimeAlive = yield* codex.adapter.hasSession(threadId);
        const stored = McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader;
        const credentialAlive =
          stored === undefined
            ? false
            : (yield* registry.resolve(stored.replace(/^Bearer\s+/, ""))) !== undefined;

        // Both directions, because each failure mode is one of them and a fix
        // for either alone turns into the other. A credential outliving its
        // runtime is the authentication hole; a runtime outliving its
        // credential is the wedge, routable and permanently 401ing.
        assert.equal(
          credentialAlive && !runtimeAlive,
          false,
          "a bearer still resolves for a thread whose runtime was torn down",
        );
        assert.equal(
          runtimeAlive && !credentialAlive,
          false,
          "a runtime is still running for a thread whose credential was withdrawn",
        );

        McpProviderSession.clearMcpProviderSession(threadId);
      }).pipe(Effect.provide(providerLayer));
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );

  // The shutdown path has the same asymmetry as a single stop, one instance at
  // a time. `stopAll()` may tear runtimes down and then fail, so the
  // withdrawal cannot sit after it — the failure would short-circuit it and
  // leave every thread's bearer resolving. (It does not sit at the very top of
  // `runStopAll` either: stranded ahead of the directory work above it, an
  // unrelated failure there would revoke every credential without asking a
  // single runtime to stop.)
  it.effect("revokes every credential even when the shutdown fails", () =>
    Effect.gen(function* () {
      const threadId = asThreadId("thread-mcp-stopall-failure");
      const codex = makeFakeCodexAdapter();
      codex.stopAll.mockImplementation(() =>
        Effect.fail(
          new ProviderAdapterRequestError({
            provider: String(CODEX_DRIVER),
            method: "stopAll",
            detail: "simulated stopAll failure",
          }),
        ),
      );
      const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
        Layer.provide(SqlitePersistenceMemory),
      );
      const providerLayer = makeProviderServiceLive().pipe(
        Layer.provide(
          Layer.succeed(
            ProviderAdapterRegistry.ProviderAdapterRegistry,
            makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter }),
          ),
        ),
        Layer.provide(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
        Layer.provide(ServerSettings.ServerSettingsService.layerTest({})),
        Layer.provide(serverConfigTestLayer),
        Layer.provide(AnalyticsService.layerTest),
        Layer.provide(
          Layer.succeed(
            ProviderEventLoggers.ProviderEventLoggers,
            ProviderEventLoggers.NoOpProviderEventLoggers,
          ),
        ),
      );

      // The registry outlives the provider service, so the credential can be
      // inspected after the service finalizer has run.
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const scope = yield* Scope.make();
      const runtimeServices = yield* Layer.build(providerLayer).pipe(Scope.provide(scope));
      yield* Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        yield* provider.startSession(threadId, {
          provider: CODEX_DRIVER,
          providerInstanceId: codexInstanceId,
          threadId,
          runtimeMode: "full-access",
        });
      }).pipe(Effect.provide(runtimeServices));

      const token = (
        McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader ?? ""
      ).replace(/^Bearer\s+/, "");
      assert.equal((yield* registry.resolve(token))?.threadId, threadId);

      const closeExit = yield* Scope.close(scope, Exit.void).pipe(Effect.exit);
      assert.equal(Exit.isSuccess(closeExit), true);
      assert.equal(codex.stopAll.mock.calls.length, 1);
      assert.equal(yield* registry.resolve(token), undefined);
      assert.equal(McpProviderSession.readMcpProviderSession(threadId), undefined);
    }).pipe(Effect.provide(registryLayer), Effect.scoped),
  );
});
