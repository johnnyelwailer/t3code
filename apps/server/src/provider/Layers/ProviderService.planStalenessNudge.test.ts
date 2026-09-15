// @effect-diagnostics nodeBuiltinImport:off
/**
 * Plan-staleness nudge at turn framing.
 *
 * `ProviderService.sendTurn` appends the single nudge line to the model's
 * input ONLY when the thread's plan age (tool activity events appended
 * since the last plan write, kept by ThreadPlanStalenessService) reaches
 * PLAN_STALENESS_NUDGE_THRESHOLD. Below the threshold the input passes
 * through untouched; a plan write resets the age for the next turn.
 * Deterministic — no timers, no sleeps.
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
import * as Stream from "effect/Stream";

import * as ThreadPlanStaleness from "../../orchestration/ThreadPlanStaleness.ts";
import {
  PLAN_STALENESS_NUDGE_THRESHOLD,
  renderPlanStalenessNudge,
} from "../../orchestration/planStalenessNudge.ts";
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

const CODEX_DRIVER = ProviderDriverKind.make("codex");
const codexInstanceId = ProviderInstanceId.make("codex");
const asThreadId = (value: string): ThreadId => ThreadId.make(value);
const asTurnId = (value: string): TurnId => TurnId.make(value);

const capturedSendTurnInputs: Array<unknown> = [];

const makeCapturingAdapter = (): ProviderAdapterShape<ProviderAdapterError> => {
  const sessions = new Map<ThreadId, ProviderSession>();
  const runtimeEventPubSub = Effect.runSync(PubSub.unbounded<ProviderRuntimeEvent>());

  const startSession = (
    input: ProviderSessionStartInput,
  ): Effect.Effect<ProviderSession, ProviderAdapterError> =>
    Effect.sync(() => {
      const now = "2026-01-01T00:00:00.000Z";
      const session: ProviderSession = {
        provider: CODEX_DRIVER,
        ...(input.providerInstanceId !== undefined
          ? { providerInstanceId: input.providerInstanceId }
          : {}),
        status: "ready",
        runtimeMode: input.runtimeMode,
        threadId: input.threadId,
        resumeCursor: { opaque: `resume-${String(input.threadId)}` },
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
          provider: CODEX_DRIVER,
          threadId: input.threadId,
        }),
      );
    }
    capturedSendTurnInputs.push(input);
    return Effect.succeed({
      threadId: input.threadId,
      turnId: asTurnId(`turn-${String(input.threadId)}`),
    });
  };

  const adapter: ProviderAdapterShape<ProviderAdapterError> = {
    provider: CODEX_DRIVER,
    capabilities: {
      sessionModelSwitch: "in-session",
      promptlessTurnContinuation: true,
    },
    startSession,
    sendTurn,
    interruptTurn: () => Effect.void,
    respondToRequest: (
      _threadId: ThreadId,
      _requestId: string,
      _decision: ProviderApprovalDecision,
    ): Effect.Effect<void, ProviderAdapterError> => Effect.void,
    respondToUserInput: (
      _threadId: ThreadId,
      _requestId: string,
      _answers: ProviderUserInputAnswers,
    ): Effect.Effect<void, ProviderAdapterError> => Effect.void,
    stopSession: (threadId: ThreadId): Effect.Effect<void, ProviderAdapterError> =>
      Effect.sync(() => {
        sessions.delete(threadId);
      }),
    listSessions: (): Effect.Effect<ReadonlyArray<ProviderSession>> =>
      Effect.sync(() => Array.from(sessions.values())),
    hasSession: (threadId: ThreadId): Effect.Effect<boolean> => Effect.succeed(sessions.has(threadId)),
    readThread: (
      threadId: ThreadId,
    ): Effect.Effect<
      { threadId: ThreadId; turns: ReadonlyArray<{ id: TurnId; items: readonly [] }> },
      ProviderAdapterError
    > => Effect.succeed({ threadId, turns: [] }),
    rollbackThread: (
      threadId: ThreadId,
      _numTurns: number,
    ): Effect.Effect<{ threadId: ThreadId; turns: readonly [] }, ProviderAdapterError> =>
      Effect.succeed({ threadId, turns: [] }),
    stopAll: (): Effect.Effect<void, ProviderAdapterError> =>
      Effect.sync(() => {
        sessions.clear();
      }),
    get streamEvents() {
      return Stream.fromPubSub(runtimeEventPubSub);
    },
  };

  return adapter;
};

const fixtureCwdRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "plan-staleness-nudge-"));
afterAll(() => NodeFS.rmSync(fixtureCwdRoot, { recursive: true, force: true }));
const PROJECT_CWD = NodePath.join(fixtureCwdRoot, "project");
NodeFS.mkdirSync(PROJECT_CWD, { recursive: true });

const adapter = makeCapturingAdapter();
const registry = makeAdapterRegistryMock({ [CODEX_DRIVER]: adapter });
const providerAdapterLayer = Layer.succeed(ProviderAdapterRegistry.ProviderAdapterRegistry, registry);
const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(Layer.provide(SqlitePersistenceMemory));
const directoryLayer = ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer));
// One shared in-memory counter instance: the provider layer reads it via
// serviceOption (provider-only runtimes omit it entirely), and the test body
// drives the same object directly.
const staleness = ThreadPlanStaleness.make();
const stalenessLayer = Layer.succeed(ThreadPlanStaleness.ThreadPlanStalenessService, staleness);

const layer = it.layer(
  Layer.mergeAll(
    makeProviderServiceLive().pipe(
      Layer.provide(providerAdapterLayer),
      Layer.provide(directoryLayer),
      Layer.provide(ServerSettings.ServerSettingsService.layerTest()),
      Layer.provide(ServerConfig.layerTest(process.cwd(), process.cwd()).pipe(Layer.provide(NodeServices.layer))),
      Layer.provideMerge(AnalyticsService.layerTest),
      Layer.provide(
        Layer.succeed(
          ProviderEventLoggers.ProviderEventLoggers,
          ProviderEventLoggers.NoOpProviderEventLoggers,
        ),
      ),
      Layer.provide(stalenessLayer),
    ),
    stalenessLayer,
    directoryLayer,
    runtimeRepositoryLayer,
  ).pipe(Layer.provideMerge(NodeServices.layer)),
);

const startSession = (provider: ProviderService.ProviderService["Service"], threadId: ThreadId) =>
  provider.startSession(threadId, {
    provider: CODEX_DRIVER,
    providerInstanceId: codexInstanceId,
    threadId,
    cwd: PROJECT_CWD,
    runtimeMode: "full-access",
  });

layer("plan-staleness nudge at turn framing", (it) => {
  it.effect("leaves the input untouched below the threshold", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const threadId = asThreadId("thread-below");
      yield* startSession(provider, threadId);

      for (let i = 0; i < PLAN_STALENESS_NUDGE_THRESHOLD - 1; i += 1) {
        staleness.recordToolActivity(threadId);
      }
      capturedSendTurnInputs.length = 0;
      yield* provider.sendTurn({ threadId, input: "keep going", attachments: [] });

      const sent = capturedSendTurnInputs[0] as { input?: string };
      assert.strictEqual(sent.input, "keep going");
    }),
  );

  it.effect("appends the nudge line once the threshold is reached", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const threadId = asThreadId("thread-stale");
      yield* startSession(provider, threadId);

      for (let i = 0; i < PLAN_STALENESS_NUDGE_THRESHOLD; i += 1) {
        staleness.recordToolActivity(threadId);
      }
      capturedSendTurnInputs.length = 0;
      yield* provider.sendTurn({ threadId, input: "keep going", attachments: [] });

      const sent = capturedSendTurnInputs[0] as { input: string };
      assert.strictEqual(
        sent.input,
        `keep going\n\n${renderPlanStalenessNudge(PLAN_STALENESS_NUDGE_THRESHOLD)}`,
      );
    }),
  );

  it.effect("stops nudging after a plan write resets the age", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const threadId = asThreadId("thread-reset");
      yield* startSession(provider, threadId);

      for (let i = 0; i < PLAN_STALENESS_NUDGE_THRESHOLD; i += 1) {
        staleness.recordToolActivity(threadId);
      }
      staleness.recordPlanWrite(threadId);
      capturedSendTurnInputs.length = 0;
      yield* provider.sendTurn({ threadId, input: "fresh start", attachments: [] });

      const sent = capturedSendTurnInputs[0] as { input: string };
      assert.strictEqual(sent.input, "fresh start");
    }),
  );

  it.effect("appends nothing to textless continuation turns", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const threadId = asThreadId("thread-continuation");
      yield* startSession(provider, threadId);

      for (let i = 0; i < PLAN_STALENESS_NUDGE_THRESHOLD + 5; i += 1) {
        staleness.recordToolActivity(threadId);
      }
      capturedSendTurnInputs.length = 0;
      yield* provider.sendTurn({ threadId, continuation: true });

      const sent = capturedSendTurnInputs[0] as { input?: string };
      assert.strictEqual(sent.input, undefined);
    }),
  );

  it.effect("does not nudge a fresh thread that has never written a plan", () =>
    Effect.gen(function* () {
      const provider = yield* ProviderService.ProviderService;
      const threadId = asThreadId("thread-fresh");
      yield* startSession(provider, threadId);

      capturedSendTurnInputs.length = 0;
      yield* provider.sendTurn({ threadId, input: "first message", attachments: [] });

      const sent = capturedSendTurnInputs[0] as { input: string };
      assert.strictEqual(sent.input, "first message");
    }),
  );
});
