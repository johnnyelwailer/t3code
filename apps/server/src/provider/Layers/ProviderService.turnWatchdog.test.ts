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

function makeFakeAdapter(
  provider: ProviderDriverKind,
  options?: {
    /**
     * When true, `interruptTurn` fails with `ProviderAdapterSessionNotFoundError`
     * — simulates a dead provider session (GHE #297 Defect 1 test (a)).
     */
    readonly interruptTurnFails?: boolean;
  },
) {
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
    }).pipe(
      Effect.andThen(
        options?.interruptTurnFails
          ? Effect.fail(new ProviderAdapterSessionNotFoundError({ provider, threadId }))
          : Effect.void,
      ),
    );

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
  providerServiceOptions?: Parameters<typeof makeProviderServiceLive>[0],
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
      makeProviderServiceLive(providerServiceOptions).pipe(
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

const findSessionExited = (events: ReadonlyArray<ProviderRuntimeEvent>) =>
  events.find((event) => event.type === "session.exited");

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

const retryAnnouncementWarning = (
  threadId: ThreadId,
  turnId: TurnId,
  delayMs: number,
  eventId: string,
): LegacyProviderRuntimeEvent => ({
  type: "runtime.warning",
  eventId: asEventId(eventId),
  provider: CODEX_DRIVER,
  createdAt: "2026-01-01T00:00:00.000Z",
  threadId,
  turnId,
  payload: {
    message: `Retrying (attempt 11 of 14, waiting 17m): 423 gpu_reserved`,
    detail: { code: "provider.retry", attempt: 11, maxAttempts: 14, delayMs },
  },
});

const codexAnnounced = makeFakeAdapter(CODEX_DRIVER);
const announcedHarness = makeWatchdogHarness({ [CODEX_DRIVER]: codexAnnounced.adapter });

announcedHarness.layer("turn inactivity watchdog: announced retry backoff (GHE #306)", (it) => {
  it.effect(
    "does not fire mid-sleep when the driver announces a backoff longer than the budget",
    () =>
      Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        codexAnnounced.interruptTurnCalls.length = 0;

        yield* startCodexSession(provider, asThreadId("thread-announced"));
        const turn = yield* provider.sendTurn({
          threadId: asThreadId("thread-announced"),
          input: "hello",
          attachments: [],
        });
        yield* drainFibers;

        // The driver announces it will sleep 1024s (Pi's attempt-11 wait,
        // longer than the 600s default budget) before its next attempt.
        codexAnnounced.emit(
          retryAnnouncementWarning(
            asThreadId("thread-announced"),
            turn.turnId,
            1_024_000,
            "retry-1",
          ),
        );
        yield* drainFibers;

        // 600s plain budget would have fired long ago; the effective budget
        // is now 1024s + 120s slack = 1144s.
        yield* advanceTestClock(1_143_000);
        yield* drainFibers;
        assert.equal(
          codexAnnounced.interruptTurnCalls.length,
          0,
          "no interrupt inside the announced window",
        );

        // Crossing the extended budget still fires the backstop.
        yield* advanceTestClock(5_000);
        yield* drainFibers;
        assert.equal(codexAnnounced.interruptTurnCalls.length, 1);
        assert.deepEqual(codexAnnounced.interruptTurnCalls[0], [
          asThreadId("thread-announced"),
          turn.turnId,
        ]);
      }),
  );

  it.effect("a warning without the provider.retry detail re-arms the plain budget", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      codexAnnounced.interruptTurnCalls.length = 0;

      yield* startCodexSession(provider, asThreadId("thread-other-warning"));
      yield* provider.sendTurn({
        threadId: asThreadId("thread-other-warning"),
        input: "hello",
        attachments: [],
      });
      yield* drainFibers;

      // A large delayMs under a DIFFERENT detail code must not extend the
      // budget — only the provider.retry announcement does.
      codexAnnounced.emit({
        type: "runtime.warning",
        eventId: asEventId("other-warning"),
        provider: CODEX_DRIVER,
        createdAt: "2026-01-01T00:00:00.000Z",
        threadId: asThreadId("thread-other-warning"),
        payload: {
          message: "something else",
          detail: { code: "something.else", delayMs: 10_000_000 },
        },
      });
      yield* drainFibers;

      yield* advanceTestClock(600_000);
      yield* drainFibers;
      assert.equal(codexAnnounced.interruptTurnCalls.length, 1);
    }),
  );

  it.effect("a buggy huge announcement cannot disable the backstop (24h cap)", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      codexAnnounced.interruptTurnCalls.length = 0;

      yield* startCodexSession(provider, asThreadId("thread-huge"));
      const turn = yield* provider.sendTurn({
        threadId: asThreadId("thread-huge"),
        input: "hello",
        attachments: [],
      });
      yield* drainFibers;

      // 100 days announced: the budget caps at 24h, it does not vanish.
      codexAnnounced.emit(
        retryAnnouncementWarning(
          asThreadId("thread-huge"),
          turn.turnId,
          100 * 24 * 60 * 60 * 1000,
          "retry-huge",
        ),
      );
      yield* drainFibers;

      yield* advanceTestClock(24 * 60 * 60 * 1000 - 1_000);
      yield* drainFibers;
      assert.equal(codexAnnounced.interruptTurnCalls.length, 0);
      yield* advanceTestClock(2_000);
      yield* drainFibers;
      assert.equal(codexAnnounced.interruptTurnCalls.length, 1);
    }),
  );
});

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

const codexReplace = makeFakeAdapter(CODEX_DRIVER);
const replaceHarness = makeWatchdogHarness({ [CODEX_DRIVER]: codexReplace.adapter });

replaceHarness.layer("turn inactivity watchdog: session replacement (GHE #328)", (it) => {
  it.effect("does not fire the previous turn's watchdog into a replacement session", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      codexReplace.interruptTurnCalls.length = 0;

      yield* startCodexSession(provider, asThreadId("thread-replace"));
      yield* provider.sendTurn({
        threadId: asThreadId("thread-replace"),
        input: "hello",
        attachments: [],
      });
      yield* drainFibers;

      // Replace the session on the same thread while the in-flight turn's
      // inactivity watchdog is still armed (a model or runtime-mode change
      // restarts the session). The armed timer belongs to the replaced
      // session: startSession must disarm it, otherwise it fires into the
      // replacement session and closes a live session for no apparent reason.
      yield* startCodexSession(provider, asThreadId("thread-replace"));
      yield* drainFibers;

      yield* advanceTestClock(600_000);
      yield* drainFibers;
      assert.equal(
        codexReplace.interruptTurnCalls.length,
        0,
        "stale watchdog must not interrupt the replacement session",
      );

      // The replacement session's own turn is still covered: sendTurn
      // re-arms the watchdog and it fires for the new turn when it stalls.
      const freshTurn = yield* provider.sendTurn({
        threadId: asThreadId("thread-replace"),
        input: "again",
        attachments: [],
      });
      yield* drainFibers;
      yield* advanceTestClock(600_000);
      yield* drainFibers;
      assert.equal(codexReplace.interruptTurnCalls.length, 1);
      assert.deepEqual(codexReplace.interruptTurnCalls[0], [
        asThreadId("thread-replace"),
        freshTurn.turnId,
      ]);
    }),
  );
});

// GHE #297 Defect 1: a dead provider session never emits the terminal event
// that would normally settle a turn. `fireTurnWatchdog` must settle it
// itself, from either failure shape of its own `interruptTurn` call.
const codexDeadSession = makeFakeAdapter(CODEX_DRIVER, { interruptTurnFails: true });
const deadSessionHarness = makeWatchdogHarness({ [CODEX_DRIVER]: codexDeadSession.adapter });

deadSessionHarness.layer(
  "turn inactivity watchdog: dead provider session (GHE #297 Defect 1)",
  (it) => {
    it.effect(
      "publishes a synthetic session.exited when interruptTurn fails on a dead session",
      () =>
        Effect.gen(function* () {
          const provider = yield* ProviderService.ProviderService;
          const seen = yield* collectRuntimeEvents(provider);

          yield* startCodexSession(provider, asThreadId("thread-dead"));
          const turn = yield* provider.sendTurn({
            threadId: asThreadId("thread-dead"),
            input: "hello",
            attachments: [],
          });
          yield* drainFibers;

          // The 600s default budget expires; interruptTurn fails because the
          // session is dead (ProviderAdapterSessionNotFoundError). The old
          // code only logWarning-swallowed this, leaving the turn "running"
          // forever with nothing left to ever emit a terminal event.
          yield* advanceTestClock(600_000);
          yield* drainFibers;

          assert.equal(codexDeadSession.interruptTurnCalls.length, 1);
          const exited = findSessionExited(yield* Ref.get(seen));
          assert.ok(exited !== undefined, "expected a synthetic session.exited");
          assert.equal(exited.threadId, asThreadId("thread-dead"));
          assert.equal(exited.turnId, turn.turnId);
          const payload = exited.payload as {
            reason: string;
            exitKind: string;
            recoverable: boolean;
          };
          assert.equal(payload.exitKind, "error");
          assert.equal(payload.recoverable, false);
          assert.ok(
            payload.reason.includes("no stream activity for 600 seconds"),
            `unexpected reason: ${payload.reason}`,
          );
        }),
    );
  },
);

// A settle-grace window after a SUCCESSFUL watchdog interrupt: the provider
// is expected to settle the turn itself, but if no terminal event lands
// within the grace, the host synthesizes one. Uses a short grace override so
// TestClock assertions stay fast.
const codexSettleGrace = makeFakeAdapter(CODEX_DRIVER);
const settleGraceHarness = makeWatchdogHarness(
  { [CODEX_DRIVER]: codexSettleGrace.adapter },
  undefined,
  { turnWatchdogSettleGraceMs: 5_000 },
);

settleGraceHarness.layer(
  "turn inactivity watchdog: settle grace after a successful interrupt (GHE #297 Defect 1)",
  (it) => {
    it.effect(
      "synthesizes session.exited when interruptTurn succeeds but no terminal event follows",
      () =>
        Effect.gen(function* () {
          const provider = yield* ProviderService.ProviderService;
          const seen = yield* collectRuntimeEvents(provider);
          codexSettleGrace.interruptTurnCalls.length = 0;

          yield* startCodexSession(provider, asThreadId("thread-grace-timeout"));
          const turn = yield* provider.sendTurn({
            threadId: asThreadId("thread-grace-timeout"),
            input: "hello",
            attachments: [],
          });
          yield* drainFibers;

          yield* advanceTestClock(600_000);
          yield* drainFibers;
          assert.equal(codexSettleGrace.interruptTurnCalls.length, 1);
          // The interrupt succeeded but the provider has not (yet) settled
          // the turn — no synthetic event before the grace elapses.
          assert.equal(
            findSessionExited(yield* Ref.get(seen)),
            undefined,
            "no synthetic session.exited before the grace window elapses",
          );

          yield* advanceTestClock(5_000);
          yield* drainFibers;

          const exited = findSessionExited(yield* Ref.get(seen));
          assert.ok(
            exited !== undefined,
            "expected a synthetic session.exited after the grace window",
          );
          assert.equal(exited.threadId, asThreadId("thread-grace-timeout"));
          assert.equal(exited.turnId, turn.turnId);
        }),
    );

    it.effect(
      "does not synthesize session.exited when the adapter settles the turn within the grace window",
      () =>
        Effect.gen(function* () {
          const provider = yield* ProviderService.ProviderService;
          const seen = yield* collectRuntimeEvents(provider);
          codexSettleGrace.interruptTurnCalls.length = 0;

          yield* startCodexSession(provider, asThreadId("thread-grace-recovers"));
          const turn = yield* provider.sendTurn({
            threadId: asThreadId("thread-grace-recovers"),
            input: "hello",
            attachments: [],
          });
          yield* drainFibers;

          yield* advanceTestClock(600_000);
          yield* drainFibers;
          assert.equal(codexSettleGrace.interruptTurnCalls.length, 1);

          // The provider recovers in time: it emits the turn's own
          // turn.aborted before the grace window elapses.
          codexSettleGrace.emit({
            type: "turn.aborted",
            eventId: asEventId("grace-recovers-aborted"),
            provider: CODEX_DRIVER,
            createdAt: "2026-01-01T00:00:00.000Z",
            threadId: asThreadId("thread-grace-recovers"),
            turnId: turn.turnId,
            payload: { reason: "interrupted by watchdog" },
          });
          yield* drainFibers;

          yield* advanceTestClock(5_000);
          yield* drainFibers;

          assert.equal(
            findSessionExited(yield* Ref.get(seen)),
            undefined,
            "the real terminal event must cancel the settle-grace fiber",
          );
        }),
    );
  },
);
