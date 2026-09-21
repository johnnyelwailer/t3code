// @effect-diagnostics nodeBuiltinImport:off
/**
 * Turn-supersede marker: when a new sendTurn replaces an in-flight turn, the
 * pack settles the SUPERSEDED turn with a turn.aborted that is structurally
 * identical to a genuine user stop (free-text reason, no marker). The host
 * stamps that late abort with the structured `payload.superseded` flag so the
 * ingestion layer can tag the resulting session-set and the child-wait router
 * can treat it as a resume-epoch boundary instead of a terminal stop. The
 * marker comes from the writer (sendTurn, the only place that knows a new
 * message replaced the turn) — never from matching the pack's free text.
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
import { it, assert, afterAll } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

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
const codexInstanceId = ProviderInstanceId.make("codex");

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

function makeFakeAdapter() {
  const sessions = new Map<ThreadId, ProviderSession>();
  const runtimeEventPubSub = Effect.runSync(PubSub.unbounded<ProviderRuntimeEvent>());
  const turnsPerThread = new Map<ThreadId, number>();

  const startSession = (input: ProviderSessionStartInput): Effect.Effect<ProviderSession, ProviderAdapterError> =>
    Effect.sync(() => {
      const now = "2026-01-01T00:00:00.000Z";
      const session: ProviderSession = {
        provider: CODEX_DRIVER,
        providerInstanceId: input.providerInstanceId,
        status: "ready",
        runtimeMode: input.runtimeMode,
        threadId: input.threadId,
        resumeCursor: input.resumeCursor ?? { opaque: `resume-${String(input.threadId)}` },
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
        new ProviderAdapterSessionNotFoundError({ provider: CODEX_DRIVER, threadId: input.threadId }),
      );
    }
    const n = (turnsPerThread.get(input.threadId) ?? 0) + 1;
    turnsPerThread.set(input.threadId, n);
    return Effect.succeed({
      threadId: input.threadId,
      turnId: asTurnId(n === 1 ? `turn-${String(input.threadId)}` : `turn-${String(input.threadId)}-${n}`),
    });
  };

  const interruptTurn = (): Effect.Effect<void, ProviderAdapterError> => Effect.void;
  const respondToRequest = (): Effect.Effect<void, ProviderAdapterError> => Effect.void;
  const respondToUserInput = (): Effect.Effect<void, ProviderAdapterError> => Effect.void;
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
  ): Effect.Effect<{ threadId: ThreadId; turns: ReadonlyArray<{ id: TurnId; items: readonly [] }> }, ProviderAdapterError> =>
    Effect.succeed({ threadId, turns: [{ id: asTurnId("turn-1"), items: [] }] });
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
    provider: CODEX_DRIVER,
    capabilities: { sessionModelSwitch: "in-session" },
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

  return { adapter, emit };
}

const fixtureCwdRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "provider-turn-supersede-test-"));
afterAll(() => NodeFS.rmSync(fixtureCwdRoot, { recursive: true, force: true }));
const PROJECT_CWD = NodePath.join(fixtureCwdRoot, "project");
NodeFS.mkdirSync(PROJECT_CWD, { recursive: true });

const defaultServerSettingsLayer = ServerSettings.ServerSettingsService.layerTest();
const serverConfigTestLayer = ServerConfig.layerTest(process.cwd(), process.cwd()).pipe(
  Layer.provide(NodeServices.layer),
);

function makeSupersedeHarness() {
  const codex = makeFakeAdapter();
  const registry = makeAdapterRegistryMock({ [CODEX_DRIVER]: codex.adapter });
  const providerAdapterLayer = Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, registry);
  const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(Layer.provide(SqlitePersistenceMemory));
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
    ).pipe(Layer.provideMerge(NodeServices.layer)),
  );
  return { layer, codex };
}

const startCodexSession = (
  provider: ProviderService.ProviderService["Service"],
  threadId: ThreadId,
) =>
  provider.startSession(threadId, {
    provider: CODEX_DRIVER,
    providerInstanceId: codexInstanceId,
    threadId,
    cwd: PROJECT_CWD,
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

// Let forked consumer fibers (the adapter stream subscription and the
// collector) reach a quiescent point before asserting — same pattern as the
// watchdog tests.
const drainFibers = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, {
  discard: true,
});

const abortedEvents = (events: ReadonlyArray<ProviderRuntimeEvent>) =>
  events.filter((event) => event.type === "turn.aborted");

const abortedPayload = (event: ProviderRuntimeEvent): { superseded?: boolean } =>
  (event as { payload?: { superseded?: boolean } }).payload ?? {};

const supersedeHarness = makeSupersedeHarness();
supersedeHarness.layer("turn-supersede marker", (it) => {
  it.effect(
    "stamps a superseded turn's late turn.aborted when a new message replaced the in-flight turn",
    () =>
      Effect.gen(function* () {
        const provider = yield* ProviderService.ProviderService;
        const seen = yield* collectRuntimeEvents(provider);
        const threadId = asThreadId("thread-supersede");
        yield* startCodexSession(provider, threadId);
        const firstTurn = yield* provider.sendTurn({
          threadId,
          input: "first message",
          attachments: [],
        });
        const secondTurn = yield* provider.sendTurn({
          threadId,
          input: "second message (nudge)",
          attachments: [],
        });
        assert.notEqual(secondTurn.turnId, firstTurn.turnId);
        // The pack settles the superseded (first) turn with a late abort.
        supersedeHarness.codex.emit({
          type: "turn.aborted",
          eventId: asEventId("evt-superseded-abort"),
          provider: CODEX_DRIVER,
          threadId,
          turnId: firstTurn.turnId,
          createdAt: "2026-01-01T00:00:02.000Z",
          payload: { reason: "superseded by a new message" },
        });
        yield* drainFibers;
        const aborted = abortedEvents(yield* Ref.get(seen));
        assert.equal(aborted.length, 1, "expected one published turn.aborted");
        const onlyAborted = aborted[0];
        assert.ok(onlyAborted !== undefined);
        assert.equal(onlyAborted.turnId, firstTurn.turnId);
        assert.equal(abortedPayload(onlyAborted).superseded, true, "late abort must carry the marker");
      }),
  );

  it.effect("does NOT stamp a genuine user-stop abort", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const seen = yield* collectRuntimeEvents(provider);
      const threadId = asThreadId("thread-genuine-stop");
      yield* startCodexSession(provider, threadId);
      const turn = yield* provider.sendTurn({ threadId, input: "hello", attachments: [] });
      // A genuine user interrupt: no new message replaced the turn.
      yield* provider.interruptTurn({ threadId, turnId: turn.turnId });
      supersedeHarness.codex.emit({
        type: "turn.aborted",
        eventId: asEventId("evt-genuine-abort"),
        provider: CODEX_DRIVER,
        threadId,
        turnId: turn.turnId,
        createdAt: "2026-01-01T00:00:02.000Z",
        payload: { reason: "Interrupted by user." },
      });
      yield* drainFibers;
      const aborted = abortedEvents(yield* Ref.get(seen));
      assert.equal(aborted.length, 1);
      const onlyAborted = aborted[0];
      assert.ok(onlyAborted !== undefined);
      assert.equal(abortedPayload(onlyAborted).superseded, undefined, "genuine stop must stay unmarked");
    }),
  );

  it.effect("consumes the marker so a duplicate abort is stamped at most once", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const seen = yield* collectRuntimeEvents(provider);
      const threadId = asThreadId("thread-dup-abort");
      yield* startCodexSession(provider, threadId);
      const firstTurn = yield* provider.sendTurn({ threadId, input: "first", attachments: [] });
      yield* provider.sendTurn({ threadId, input: "second", attachments: [] });
      for (const eventId of ["evt-dup-abort-1", "evt-dup-abort-2"]) {
        supersedeHarness.codex.emit({
          type: "turn.aborted",
          eventId: asEventId(eventId),
          provider: CODEX_DRIVER,
          threadId,
          turnId: firstTurn.turnId,
          createdAt: "2026-01-01T00:00:03.000Z",
          payload: { reason: "superseded by a new message" },
        });
      }
      yield* drainFibers;
      const stamped = abortedEvents(yield* Ref.get(seen)).filter((event) =>
        abortedPayload(event).superseded === true,
      );
      assert.equal(stamped.length, 1, "the marker must be consumed by the first matching abort");
    }),
  );

  it.effect("consumes the marker on a matching turn.completed without stamping", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const seen = yield* collectRuntimeEvents(provider);
      const threadId = asThreadId("thread-completed");
      yield* startCodexSession(provider, threadId);
      const firstTurn = yield* provider.sendTurn({ threadId, input: "first", attachments: [] });
      yield* provider.sendTurn({ threadId, input: "second", attachments: [] });
      // The superseded turn somehow completes normally instead of aborting.
      supersedeHarness.codex.emit({
        type: "turn.completed",
        eventId: asEventId("evt-completed-superseded"),
        provider: CODEX_DRIVER,
        threadId,
        turnId: firstTurn.turnId,
        createdAt: "2026-01-01T00:00:04.000Z",
        payload: { state: "completed" },
      });
      yield* drainFibers;
      const events = yield* Ref.get(seen);
      assert.equal(
        events.some((event) => abortedPayload(event).superseded === true),
        false,
        "a completed turn must never carry the supersede marker",
      );
    }),
  );
});
