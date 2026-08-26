// @effect-diagnostics nodeBuiltinImport:off
/**
 * Host-level per-provider turn inactivity watchdog (GHE #113).
 *
 * The watchdog lives in `ProviderService` (the host provider layer) and is
 * provider-agnostic: it arms on `sendTurn`, resets on ANY runtime event the
 * adapter's `streamEvents` emits for that thread, and aborts the turn via
 * `interruptTurn` when the per-provider budget expires. The per-provider
 * budget is `ProviderInstanceConfig.turnInactivityTimeoutSeconds`, surfaced
 * through `ProviderAdapterRegistry.getInstanceInfo`.
 *
 * Timers use the Effect Clock, so `TestClock` drives them in tests — the
 * same approach the pack-level watchdog tests use.
 */
import type {
  ProviderApprovalDecision,
  ProviderRuntimeEvent,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
  ProviderUserInputAnswers,
} from "@t3tools/contracts";
import {
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { it, assert } from "@effect/vitest";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { ProviderAdapterSessionNotFoundError, type ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "../Services/ProviderAdapterRegistry.ts";
import * as ProviderService from "../Services/ProviderService.ts";
import * as ProviderSessionDirectory from "../Services/ProviderSessionDirectory.ts";
import { makeProviderServiceLive } from "./ProviderService.ts";
import * as ProviderEventLoggers from "./ProviderEventLoggers.ts";
import { ProviderSessionDirectoryLive } from "./ProviderSessionDirectory.ts";
import * as ProviderSessionRuntime from "../../persistence/ProviderSessionRuntime.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as ServerConfig from "../../config.ts";
import * as ServerSettings from "../../serverSettings.ts";
import * as AnalyticsService from "../../telemetry/AnalyticsService.ts";
import { makeAdapterRegistryMock } from "../testUtils/providerAdapterRegistryMock.ts";

const asEventId = (value: string): EventId => EventId.make(value);
const asThreadId = (value: string): ThreadId => ThreadId.make(value);
const asTurnId = (value: string): TurnId => TurnId.make(value);
const CODEX_DRIVER = ProviderDriverKind.make("codex");
const CLAUDE_AGENT_DRIVER = ProviderDriverKind.make("claudeAgent");
const codexInstanceId = ProviderInstanceId.make("codex");
const claudeAgentInstanceId = ProviderInstanceId.make("claudeAgent");

type LegacyProviderRuntimeEvent = {
  readonly type: string;
  readonly eventId: EventId;
  readonly provider: ProviderDriverKind;
  readonly createdAt: string;
  readonly threadId: ThreadId;
  readonly turnId?: string | undefined;
  readonly payload?: unknown | undefined;
  readonly [key: string]: unknown;
};

function makeFakeAdapter(provider: ProviderDriverKind) {
  const sessions = new Map<ThreadId, ProviderSession>();
  const runtimeEventPubSub = Effect.runSync(PubSub.unbounded<ProviderRuntimeEvent>());
  // Distinct turn id per sendTurn so multi-turn scenarios (e.g. a superseded
  // turn) get real turn ids; the first turn keeps the historical
  // `turn-<threadId>` shape existing tests compare against.
  const turnsPerThread = new Map<ThreadId, number>();

  const startSession = (
    input: ProviderSessionStartInput,
  ): Effect.Effect<ProviderSession, ProviderAdapterError> =>
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
    });

  const sendTurn = (
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
    const n = (turnsPerThread.get(input.threadId) ?? 0) + 1;
    turnsPerThread.set(input.threadId, n);
    return Effect.succeed({
      threadId: input.threadId,
      turnId: asTurnId(
        n === 1 ? `turn-${String(input.threadId)}` : `turn-${String(input.threadId)}-${String(n)}`,
      ),
    });
  };

  // vi.fn-style call recording without pulling in vitest spies: the
  // watchdog assertions only need the call list.
  const interruptTurnCalls: Array<[ThreadId, TurnId | undefined]> = [];
  const interruptTurn = (
    threadId: ThreadId,
    turnId?: TurnId,
  ): Effect.Effect<void, ProviderAdapterError> =>
    Effect.sync(() => {
      interruptTurnCalls.push([threadId, turnId]);
    });

  const respondToRequest = (
    _threadId: ThreadId,
    _requestId: string,
    _decision: ProviderApprovalDecision,
  ): Effect.Effect<void, ProviderAdapterError> => Effect.void;

  const respondToUserInput = (
    _threadId: ThreadId,
    _requestId: string,
    _answers: ProviderUserInputAnswers,
  ): Effect.Effect<void, ProviderAdapterError> => Effect.void;

  const stopSession = (threadId: ThreadId): Effect.Effect<void, ProviderAdapterError> =>
    Effect.sync(() => {
      sessions.delete(threadId);
    });

  const listSessions = (): Effect.Effect<ReadonlyArray<ProviderSession>> =>
    Effect.sync(() => Array.from(sessions.values()));

  const hasSession = (threadId: ThreadId): Effect.Effect<boolean> =>
    Effect.succeed(sessions.has(threadId));

  const readThread = (
    threadId: ThreadId,
  ): Effect.Effect<
    {
      threadId: ThreadId;
      turns: ReadonlyArray<{ id: TurnId; items: readonly [] }>;
    },
    ProviderAdapterError
  > => Effect.succeed({ threadId, turns: [{ id: asTurnId("turn-1"), items: [] }] });

  const rollbackThread = (
    threadId: ThreadId,
    _numTurns: number,
  ): Effect.Effect<{ threadId: ThreadId; turns: readonly [] }, ProviderAdapterError> =>
    Effect.succeed({ threadId, turns: [] });

  const stopAll = (): Effect.Effect<void, ProviderAdapterError> =>
    Effect.sync(() => {
      sessions.clear();
    });

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
    stopAll,
    get streamEvents() {
      return Stream.fromPubSub(runtimeEventPubSub);
    },
  };

  const emit = (event: LegacyProviderRuntimeEvent): void => {
    Effect.runSync(PubSub.publish(runtimeEventPubSub, event as unknown as ProviderRuntimeEvent));
  };

  return {
    adapter,
    emit,
    interruptTurnCalls,
  };
}

const advanceTestClock = (ms: number) =>
  TestClock.adjust(`${ms} millis`).pipe(Effect.andThen(Effect.yieldNow));

// Let forked consumer fibers (stream subscriptions, watchdog timers) reach a
// quiescent point before asserting — same pattern as ProviderSessionReaper's
// tests.
const drainFibers = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, {
  discard: true,
});

const defaultServerSettingsLayer = ServerSettings.ServerSettingsService.layerTest();
const serverConfigTestLayer = ServerConfig.layerTest(process.cwd(), process.cwd()).pipe(
  Layer.provide(NodeServices.layer),
);

function makeWatchdogHarness(
  adapters: Parameters<typeof makeAdapterRegistryMock>[0],
  options?: Parameters<typeof makeAdapterRegistryMock>[1],
) {
  const registry = makeAdapterRegistryMock(adapters, options);
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

  return { layer };
}

const startCodexSession = (
  provider: ProviderService.ProviderService["Service"],
  threadId: ThreadId,
) =>
  provider.startSession(threadId, {
    provider: CODEX_DRIVER,
    providerInstanceId: codexInstanceId,
    threadId,
    cwd: "/tmp/project",
    runtimeMode: "full-access",
  });

const startClaudeSession = (
  provider: ProviderService.ProviderService["Service"],
  threadId: ThreadId,
) =>
  provider.startSession(threadId, {
    provider: CLAUDE_AGENT_DRIVER,
    providerInstanceId: claudeAgentInstanceId,
    threadId,
    cwd: "/tmp/project",
    runtimeMode: "full-access",
  });

const collectRuntimeEvents = (provider: ProviderService.ProviderService["Service"]) =>
  Effect.gen(function* () {
    const seen = yield* Ref.make<ProviderRuntimeEvent[]>([]);
    yield* Stream.runForEach(provider.streamEvents, (event) =>
      Ref.update(seen, (events) => [...events, event]),
    ).pipe(Effect.forkScoped);
    yield* drainFibers;
    return seen;
  });

const findInactivityWarning = (events: ReadonlyArray<ProviderRuntimeEvent>) =>
  events.find(
    (event) =>
      event.type === "runtime.warning" &&
      (event.payload as { detail?: { code?: string } }).detail?.code === "turn.inactivity",
  );

const codexStalled = makeFakeAdapter(CODEX_DRIVER);
const stalledHarness = makeWatchdogHarness({ [CODEX_DRIVER]: codexStalled.adapter });

stalledHarness.layer("turn inactivity watchdog: stalled turn", (it) => {
  it.effect("aborts a turn that produces no stream activity for the default budget", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const seen = yield* collectRuntimeEvents(provider);

      yield* startCodexSession(provider, asThreadId("thread-stall"));
      const turn = yield* provider.sendTurn({
        threadId: asThreadId("thread-stall"),
        input: "hello",
        attachments: [],
      });
      // Let the forked watchdog timer fiber start so its sleep is
      // registered before the clock advances.
      yield* drainFibers;

      // No stream events at all: advance past the 600s host default.
      yield* advanceTestClock(600_000);
      yield* drainFibers;

      assert.equal(codexStalled.interruptTurnCalls.length, 1);
      assert.deepEqual(codexStalled.interruptTurnCalls[0], [
        asThreadId("thread-stall"),
        turn.turnId,
      ]);
      const warning = findInactivityWarning(yield* Ref.get(seen));
      assert.ok(warning !== undefined, "expected a turn.inactivity runtime.warning");
      assert.equal(warning.threadId, asThreadId("thread-stall"));
      assert.equal(warning.turnId, turn.turnId);
    }),
  );

  it.effect("does not re-fire for a turn the user already interrupted", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      codexStalled.interruptTurnCalls.length = 0;

      yield* startCodexSession(provider, asThreadId("thread-user-interrupt"));
      yield* provider.sendTurn({
        threadId: asThreadId("thread-user-interrupt"),
        input: "hello",
        attachments: [],
      });
      yield* drainFibers;
      // User interrupt wins: it clears the watchdog entry.
      yield* provider.interruptTurn({ threadId: asThreadId("thread-user-interrupt") });
      yield* advanceTestClock(600_000);
      yield* drainFibers;

      // Exactly one interrupt call — the user's, not a watchdog's.
      assert.equal(codexStalled.interruptTurnCalls.length, 1);
      assert.equal(codexStalled.interruptTurnCalls[0]?.[1], undefined);
    }),
  );

  it.effect(
    "a terminal event for an older superseded turn does not clear the current turn's watchdog",
    () =>
      Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        codexStalled.interruptTurnCalls.length = 0;

        yield* startCodexSession(provider, asThreadId("thread-supersede"));
        const firstTurn = yield* provider.sendTurn({
          threadId: asThreadId("thread-supersede"),
          input: "stuck message",
          attachments: [],
        });
        // The user sends a NEW message: the host arms the watchdog for the
        // new turn (replacing the entry).
        const secondTurn = yield* provider.sendTurn({
          threadId: asThreadId("thread-supersede"),
          input: "fresh message",
          attachments: [],
        });
        yield* drainFibers;

        // The pack settles the SUPERSEDED first turn (turn.aborted /
        // "superseded by a new message") AFTER the new turn was armed. That
        // stale terminal event must NOT clear the new turn's watchdog entry —
        // otherwise the new turn loses its stall backstop the moment it
        // starts (the observed "new message doesn't recover a stuck turn").
        codexStalled.emit({
          type: "turn.aborted",
          eventId: asEventId("superseded-abort"),
          provider: CODEX_DRIVER,
          createdAt: "2026-01-01T00:00:00.000Z",
          threadId: asThreadId("thread-supersede"),
          turnId: firstTurn.turnId,
          payload: { reason: "superseded by a new message" },
        });
        yield* drainFibers;

        // The new turn is still armed: advancing past the budget fires the
        // watchdog for the CURRENT turn, not for the superseded one.
        yield* advanceTestClock(600_000);
        yield* drainFibers;
        assert.equal(
          codexStalled.interruptTurnCalls.length,
          1,
          "watchdog still armed for the new turn",
        );
        assert.deepEqual(codexStalled.interruptTurnCalls[0], [
          asThreadId("thread-supersede"),
          secondTurn.turnId,
        ]);
      }),
  );
});

const codexActive = makeFakeAdapter(CODEX_DRIVER);
const activeHarness = makeWatchdogHarness({ [CODEX_DRIVER]: codexActive.adapter });

activeHarness.layer("turn inactivity watchdog: active stream", (it) => {
  it.effect("does not abort a turn whose stream keeps producing activity", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      yield* startCodexSession(provider, asThreadId("thread-active"));
      yield* provider.sendTurn({
        threadId: asThreadId("thread-active"),
        input: "hello",
        attachments: [],
      });
      yield* drainFibers;

      // Three near-miss cycles: activity lands just before the budget
      // expires each time. A timer that failed to reset would have fired
      // on the first cycle. 3 × 599s = 1797s total > 600s default.
      for (let i = 0; i < 3; i++) {
        yield* advanceTestClock(599_000);
        codexActive.emit({
          type: "content.delta",
          eventId: asEventId(`delta-${i}`),
          provider: CODEX_DRIVER,
          createdAt: "2026-01-01T00:00:00.000Z",
          threadId: asThreadId("thread-active"),
          turnId: asTurnId("turn-thread-active"),
          payload: { text: `chunk ${i}` },
        });
        yield* drainFibers;
      }
      assert.equal(codexActive.interruptTurnCalls.length, 0);

      // Settling the turn disarms the watchdog entirely.
      codexActive.emit({
        type: "turn.completed",
        eventId: asEventId("turn-completed"),
        provider: CODEX_DRIVER,
        createdAt: "2026-01-01T00:00:00.000Z",
        threadId: asThreadId("thread-active"),
        turnId: asTurnId("turn-thread-active"),
        payload: {},
      });
      yield* drainFibers;
      yield* advanceTestClock(600_000);
      yield* drainFibers;
      assert.equal(codexActive.interruptTurnCalls.length, 0);
    }),
  );
});

const codexFast = makeFakeAdapter(CODEX_DRIVER);
const claudeSlow = makeFakeAdapter(CLAUDE_AGENT_DRIVER);
const perProviderHarness = makeWatchdogHarness(
  {
    [CODEX_DRIVER]: codexFast.adapter,
    [CLAUDE_AGENT_DRIVER]: claudeSlow.adapter,
  },
  {
    turnInactivityTimeoutSeconds: {
      [CODEX_DRIVER]: 30,
      [CLAUDE_AGENT_DRIVER]: 120,
    },
  },
);

perProviderHarness.layer("turn inactivity watchdog: per-provider timeout", (it) => {
  it.effect("respects each provider's configured timeout independently", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;

      yield* startCodexSession(provider, asThreadId("thread-codex"));
      yield* startClaudeSession(provider, asThreadId("thread-claude"));
      yield* provider.sendTurn({
        threadId: asThreadId("thread-codex"),
        input: "hello",
        attachments: [],
      });
      yield* provider.sendTurn({
        threadId: asThreadId("thread-claude"),
        input: "hello",
        attachments: [],
      });
      yield* drainFibers;

      // 31s: past codex's 30s budget, well inside claude's 120s.
      yield* advanceTestClock(31_000);
      yield* drainFibers;
      assert.equal(codexFast.interruptTurnCalls.length, 1);
      assert.deepEqual(codexFast.interruptTurnCalls[0], [
        asThreadId("thread-codex"),
        asTurnId("turn-thread-codex"),
      ]);
      assert.equal(claudeSlow.interruptTurnCalls.length, 0);

      // 121s total: now past claude's 120s budget as well.
      yield* advanceTestClock(90_000);
      yield* drainFibers;
      assert.equal(claudeSlow.interruptTurnCalls.length, 1);
      assert.deepEqual(claudeSlow.interruptTurnCalls[0], [
        asThreadId("thread-claude"),
        asTurnId("turn-thread-claude"),
      ]);
      // And codex's watchdog does not fire a second time.
      assert.equal(codexFast.interruptTurnCalls.length, 1);
    }),
  );
});
