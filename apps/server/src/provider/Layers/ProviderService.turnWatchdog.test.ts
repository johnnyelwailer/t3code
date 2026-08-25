// @effect-diagnostics nodeBuiltinImport:off
/**
 * Host-level per-provider turn inactivity watchdog (GHE #113) and its
 * recovery chain (GHE #175/#176).
 *
 * The watchdog lives in `ProviderService` (the host provider layer) and is
 * provider-agnostic: it arms on `sendTurn`, resets on ANY runtime event the
 * adapter's `streamEvents` emits for that thread, and aborts the turn via
 * `interruptTurn` when the per-provider budget expires. The per-provider
 * budget is `ProviderInstanceConfig.turnInactivityTimeoutSeconds`, surfaced
 * through `ProviderAdapterRegistry.getInstanceInfo`.
 *
 * Recovery ownership (GHE #175/#176): after the abort, exactly ONE layer
 * retries. Adapters that declare the `turnStallRecoveryOwned` capability own
 * recovery end to end (they retry inside their own session in response to
 * the "watchdog" interrupt reason); for every other provider the host
 * re-issues the original `sendTurn` input, visualized as a
 * "Retrying (attempt n of m)" runtime.warning with detail.code
 * "provider.retry", bounded by the host budget of 3.
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
const OPENCODE_DRIVER = ProviderDriverKind.make("opencode");
const codexInstanceId = ProviderInstanceId.make("codex");
const claudeAgentInstanceId = ProviderInstanceId.make("claudeAgent");
const opencodeInstanceId = ProviderInstanceId.make("opencode");

/**
 * First attempt keeps the legacy `turn-<threadId>` shape (existing
 * assertions and stream fixtures reference it); watchdog re-issues get a
 * `-retry-N` suffix, mirroring a real adapter issuing fresh turn ids.
 */

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
  options?: { readonly turnStallRecoveryOwned?: boolean },
) {
  const sessions = new Map<ThreadId, ProviderSession>();
  const runtimeEventPubSub = Effect.runSync(PubSub.unbounded<ProviderRuntimeEvent>());

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

  const sendTurnCalls: Array<ProviderSendTurnInput> = [];
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
    sendTurnCalls.push(input);
    return Effect.succeed({
      threadId: input.threadId,
      turnId:
        sendTurnCalls.length === 1
          ? asTurnId(`turn-${String(input.threadId)}`)
          : asTurnId(`turn-${String(input.threadId)}-retry-${sendTurnCalls.length - 1}`),
    });
  };

  // vi.fn-style call recording without pulling in vitest spies: the
  // watchdog assertions only need the call list. Third element is the
  // interrupt reason — "watchdog" when the host watchdog fired, "user"
  // for an explicit stop.
  const interruptTurnCalls: Array<[ThreadId, TurnId | undefined, string | undefined]> = [];
  const interruptTurn = (
    threadId: ThreadId,
    turnId?: TurnId,
    interruptReason?: "user" | "watchdog",
  ): Effect.Effect<void, ProviderAdapterError> =>
    Effect.sync(() => {
      interruptTurnCalls.push([threadId, turnId, interruptReason]);
      // A real adapter settles the interrupted turn — the re-issue path
      // depends on that terminal event arriving on the stream (and the
      // host's stale-turn guard depending on it carrying the OLD turnId).
      if (turnId !== undefined) {
        emit({
          type: "turn.aborted",
          eventId: asEventId(`abort-${String(threadId)}-${interruptTurnCalls.length}`),
          provider,
          createdAt: "2026-01-01T00:00:00.000Z",
          threadId,
          turnId: asTurnId(String(turnId)),
          payload: { reason: "interrupted" },
        });
      }
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
      ...(options?.turnStallRecoveryOwned ? { turnStallRecoveryOwned: true } : {}),
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
    sendTurnCalls,
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

const findRetryWarnings = (events: ReadonlyArray<ProviderRuntimeEvent>) =>
  events.filter(
    (event) =>
      event.type === "runtime.warning" &&
      (event.payload as { detail?: { code?: string } }).detail?.code === "provider.retry",
  );

const startSessionFor = (
  provider: ProviderService.ProviderService["Service"],
  driver: ProviderDriverKind,
  instanceId: ProviderInstanceId,
  threadId: ThreadId,
) =>
  provider.startSession(threadId, {
    provider: driver,
    providerInstanceId: instanceId,
    threadId,
    cwd: "/tmp/project",
    runtimeMode: "full-access",
  });

// NOTE: each test below gets its OWN fake adapter + harness group. The
// harness layer (and its TestClock/watchdog state) is shared across tests
// within one group, so separate groups keep the suites independent.
const stalledTurnFake = makeFakeAdapter(CODEX_DRIVER);
makeWatchdogHarness({ [CODEX_DRIVER]: stalledTurnFake.adapter }).layer(
  "turn inactivity watchdog: stalled turn",
  (it) => {
    it.effect("aborts a turn that produces no stream activity for the default budget", () =>
      Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const seen = yield* collectRuntimeEvents(provider);
        const threadId = asThreadId("thread-stall");

        yield* startCodexSession(provider, threadId);
        const turn = yield* provider.sendTurn({
          threadId,
          input: "hello",
          attachments: [],
        });
        // Let the forked watchdog timer fiber start so its sleep is
        // registered before the clock advances.
        yield* drainFibers;

        // No stream events at all: advance past the 600s host default.
        yield* advanceTestClock(600_000);
        yield* drainFibers;

        assert.equal(stalledTurnFake.interruptTurnCalls.length, 1);
        assert.deepEqual(stalledTurnFake.interruptTurnCalls[0], [
          threadId,
          turn.turnId,
          "watchdog",
        ]);
        const warning = findInactivityWarning(yield* Ref.get(seen));
        assert.ok(warning !== undefined, "expected a turn.inactivity runtime.warning");
        assert.equal(warning.threadId, threadId);
        assert.equal(warning.turnId, turn.turnId);
      }),
    );
  },
);

const reissueFake = makeFakeAdapter(CODEX_DRIVER);
makeWatchdogHarness({ [CODEX_DRIVER]: reissueFake.adapter }).layer(
  "turn inactivity watchdog: host re-issue chain",
  (it) => {
    it.effect(
      "re-issues a stalled turn with the original input, visualized, up to the host budget",
      () =>
        Effect.gen(function* () {
          const provider = yield* ProviderService.ProviderService;
          const seen = yield* collectRuntimeEvents(provider);
          const threadId = asThreadId("thread-reissue");

          yield* startCodexSession(provider, threadId);
          yield* provider.sendTurn({
            threadId,
            input: "original prompt",
            attachments: [],
          });
          yield* drainFibers;

          // The fake adapter stays silent on every attempt: each watchdog fire
          // must interrupt and re-issue until the budget of 3 is exhausted.
          for (let attempt = 1; attempt <= 4; attempt++) {
            yield* advanceTestClock(600_000);
            yield* drainFibers;
            const events = yield* Ref.get(seen);
            const retries = findRetryWarnings(events);
            if (attempt <= 3) {
              // Interrupt + bounded re-issue, visualized as the shared
              // "Retrying (attempt n of m)" / provider.retry surface.
              assert.equal(reissueFake.interruptTurnCalls.length, attempt, `interrupt ${attempt}`);
              assert.equal(reissueFake.interruptTurnCalls[attempt - 1]?.[2], "watchdog");
              assert.equal(reissueFake.sendTurnCalls.length, attempt + 1, `re-issue ${attempt}`);
              assert.equal(retries.length, attempt, `provider.retry warning ${attempt}`);
              const last = retries[retries.length - 1] as unknown as {
                payload: {
                  message: string;
                  detail: { code: string; attempt: number; maxAttempts: number };
                };
                turnId?: string;
              };
              assert.equal(last.payload.detail.code, "provider.retry");
              assert.equal(last.payload.detail.attempt, attempt);
              assert.equal(last.payload.detail.maxAttempts, 3);
              assert.ok(last.payload.message.startsWith(`Retrying (attempt ${attempt} of 3)`));
              // The retry belongs to the NEW turn id the adapter issued.
              assert.equal(last.turnId, asTurnId(`turn-thread-reissue-retry-${attempt}`));
            } else {
              // Budget exhausted: fourth fire interrupts but re-issues nothing.
              assert.equal(reissueFake.interruptTurnCalls.length, 4);
              assert.equal(reissueFake.sendTurnCalls.length, 4);
              assert.equal(findRetryWarnings(events).length, 3);
            }
          }

          // Every re-issue re-submitted the ORIGINAL input byte-identical.
          const firstInput = reissueFake.sendTurnCalls[0]!;
          assert.deepEqual(reissueFake.sendTurnCalls, Array(4).fill(firstInput));
          assert.equal(firstInput.input, "original prompt");
        }),
    );
  },
);

const staleAbortFake = makeFakeAdapter(CODEX_DRIVER);
makeWatchdogHarness({ [CODEX_DRIVER]: staleAbortFake.adapter }).layer(
  "turn inactivity watchdog: host re-issue chain",
  (it) => {
    it.effect(
      "a stale turn.aborted from the interrupted turn does not disarm the re-issued turn",
      () =>
        Effect.gen(function* () {
          const provider = yield* ProviderService.ProviderService;
          const seen = yield* collectRuntimeEvents(provider);
          const threadId = asThreadId("thread-stale-abort");

          yield* startCodexSession(provider, threadId);
          yield* provider.sendTurn({ threadId, input: "hello", attachments: [] });
          yield* drainFibers;

          yield* advanceTestClock(600_000);
          yield* drainFibers;
          // The fake adapter already emitted the OLD turn's turn.aborted during
          // the interrupt — and the host re-issued on top of it. A terminal
          // event naming the superseded turn must not have settled the new one:
          // a second full silence budget still fires against the re-issued turn.
          assert.equal(staleAbortFake.interruptTurnCalls.length, 1);
          assert.equal(staleAbortFake.sendTurnCalls.length, 2);
          yield* advanceTestClock(600_000);
          yield* drainFibers;
          assert.equal(staleAbortFake.interruptTurnCalls.length, 2);
          assert.equal(
            staleAbortFake.interruptTurnCalls[1]?.[1],
            asTurnId("turn-thread-stale-abort-retry-1"),
          );
          assert.equal(staleAbortFake.sendTurnCalls.length, 3);
          assert.equal(findRetryWarnings(yield* Ref.get(seen)).length, 2);
        }),
    );
  },
);

const userInterruptFake = makeFakeAdapter(CODEX_DRIVER);
makeWatchdogHarness({ [CODEX_DRIVER]: userInterruptFake.adapter }).layer(
  "turn inactivity watchdog: host re-issue chain",
  (it) => {
    it.effect("does not re-fire for a turn the user already interrupted", () =>
      Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const threadId = asThreadId("thread-user-interrupt");

        yield* startCodexSession(provider, threadId);
        yield* provider.sendTurn({
          threadId,
          input: "hello",
          attachments: [],
        });
        yield* drainFibers;
        // User interrupt wins: it clears the watchdog entry.
        yield* provider.interruptTurn({ threadId });
        yield* advanceTestClock(600_000);
        yield* drainFibers;

        // Exactly one interrupt call — the user's, not a watchdog's — and it
        // carries the "user" reason so drivers never mistake a stop for a stall.
        assert.equal(userInterruptFake.interruptTurnCalls.length, 1);
        assert.equal(userInterruptFake.interruptTurnCalls[0]?.[1], undefined);
        assert.equal(userInterruptFake.interruptTurnCalls[0]?.[2], "user");
        // No host re-issue after a user stop.
        assert.equal(userInterruptFake.sendTurnCalls.length, 1);
      }),
    );
  },
);

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

const codexFast = makeFakeAdapter(CODEX_DRIVER, { turnStallRecoveryOwned: true });
const claudeSlow = makeFakeAdapter(CLAUDE_AGENT_DRIVER, { turnStallRecoveryOwned: true });
// Driver-owned recovery keeps this suite free of host re-issues, so the
// assertions isolate the per-provider TIMEOUT behavior itself.
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
        "watchdog",
      ]);
      assert.equal(claudeSlow.interruptTurnCalls.length, 0);

      // 121s total: now past claude's 120s budget as well.
      yield* advanceTestClock(90_000);
      yield* drainFibers;
      assert.equal(claudeSlow.interruptTurnCalls.length, 1);
      assert.deepEqual(claudeSlow.interruptTurnCalls[0], [
        asThreadId("thread-claude"),
        asTurnId("turn-thread-claude"),
        "watchdog",
      ]);
      // And codex's watchdog does not fire a second time.
      assert.equal(codexFast.interruptTurnCalls.length, 1);
    }),
  );
});

const openCodeStalled = makeFakeAdapter(OPENCODE_DRIVER);
const openCodeHarness = makeWatchdogHarness({ [OPENCODE_DRIVER]: openCodeStalled.adapter });

openCodeHarness.layer("turn inactivity watchdog: OpenCode adapter (GHE #176)", (it) => {
  it.effect(
    "arms on sendTurn, fires, interrupts, and re-issues through the OpenCode driver kind",
    () =>
      Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const seen = yield* collectRuntimeEvents(provider);
        const threadId = asThreadId("thread-opencode-stall");

        yield* startSessionFor(provider, OPENCODE_DRIVER, opencodeInstanceId, threadId);
        yield* provider.sendTurn({ threadId, input: "opencode prompt", attachments: [] });
        yield* drainFibers;

        // The fake OpenCode-style adapter is silent: the host watchdog must
        // arm on sendTurn regardless of driver kind, fire, and re-issue.
        yield* advanceTestClock(600_000);
        yield* drainFibers;

        assert.equal(openCodeStalled.interruptTurnCalls.length, 1);
        assert.equal(openCodeStalled.interruptTurnCalls[0]?.[2], "watchdog");
        assert.equal(openCodeStalled.sendTurnCalls.length, 2);
        assert.equal(openCodeStalled.sendTurnCalls[1]!.input, "opencode prompt");
        const retries = findRetryWarnings(yield* Ref.get(seen));
        assert.equal(retries.length, 1);
        assert.equal(
          (retries[0]!.payload as { message: string }).message,
          "Retrying (attempt 1 of 3): turn stalled — no provider stream activity for 600 seconds",
        );
      }),
  );
});

const ownedRecoveryStalled = makeFakeAdapter(CODEX_DRIVER, { turnStallRecoveryOwned: true });
const ownedHarness = makeWatchdogHarness({ [CODEX_DRIVER]: ownedRecoveryStalled.adapter });

ownedHarness.layer("turn inactivity watchdog: driver-owned recovery (pack providers)", (it) => {
  it.effect("interrupts with the watchdog reason but never host re-issues", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const seen = yield* collectRuntimeEvents(provider);
      const threadId = asThreadId("thread-owned-recovery");

      yield* startCodexSession(provider, threadId);
      yield* provider.sendTurn({ threadId, input: "hello", attachments: [] });
      yield* drainFibers;

      yield* advanceTestClock(600_000);
      yield* drainFibers;

      // The host aborts with the reason that lets the driver chain the
      // abort into its own bounded recovery — and then stays out: no
      // host re-issue, no provider.retry warning from the host.
      assert.equal(ownedRecoveryStalled.interruptTurnCalls.length, 1);
      assert.equal(ownedRecoveryStalled.interruptTurnCalls[0]?.[2], "watchdog");
      assert.equal(ownedRecoveryStalled.sendTurnCalls.length, 1, "no host re-issue");
      assert.ok(findInactivityWarning(yield* Ref.get(seen)) !== undefined);
      assert.equal(findRetryWarnings(yield* Ref.get(seen)).length, 0);
      // The stalled turn stays settled: a further budget elapses with no
      // second interrupt.
      yield* advanceTestClock(600_000);
      yield* drainFibers;
      assert.equal(ownedRecoveryStalled.interruptTurnCalls.length, 1);
    }),
  );
});
