// @effect-diagnostics globalTimers:off -- the reactor owns the silence-watch sweeper's host
// timer (see t3team-threadSilenceWatchSweeper.ts).
/**
 * Live wiring for the thread silence watchdog (GHE #63): the
 * `T3TeamThreadSilenceWatchReactorLive` layer that (1) indexes open watches
 * from persisted `watch.registered` / `.cancelled` activities, (2) resolves a
 * watch when the target leaves a terminal state or is deleted - deduped by the
 * shared terminal-notify ledger (GHE #157), which re-arms on target resume -
 * and (3) runs the sweeper that emits `thread.silent` when a target has been
 * silent for its timeout. Last-activity tracking lives in
 * ThreadSilenceWatchdogService; emission/registration side-effects live in
 * t3team-threadSilenceWatchEmit.ts; this module owns event routing + the
 * layer. Rehydration rebuilds the index from persisted events and folds the
 * ledger's markers + resumes.
 *
 * @module t3team-threadSilenceWatchReactor
 */
import { ThreadId, type OrchestrationEvent } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine.ts";
import { type OrchestrationEventStoreError } from "./persistence/Errors.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ThreadSilenceWatchdogService } from "./orchestration/ThreadSilenceWatchdog.ts";
import { sessionStatusToWaitOutcome } from "./t3team-childWait.ts";
import {
  parseThreadSilenceWatchEvent,
  SILENCE_WATCH_TERMINAL_NOTIFIED_KIND,
} from "./t3team-threadSilenceWatch.ts";
import { makeTerminalNotifyLedger } from "./t3team-terminalNotifyDedup.ts";
import {
  makeThreadSilenceWatchEmitter,
  type ThreadSilenceWatchEmitter,
} from "./t3team-threadSilenceWatchEmit.ts";
import { makeThreadSilenceWatchIndex } from "./t3team-threadSilenceWatchIndex.ts";
import { collectPendingThreadSilenceWatches } from "./t3team-threadSilenceWatchRehydrate.ts";
import {
  makeThreadSilenceWatchSweeper,
  type ThreadSilenceWatchClock,
} from "./t3team-threadSilenceWatchSweeper.ts";

export interface ThreadSilenceWatchReactorDeps {
  readonly engine: OrchestrationEngineShape;
  readonly query: ProjectionSnapshotQueryShape;
  readonly watchdog: {
    readonly seedActivity: (threadId: string, lastActivityAtMs: number) => void;
    readonly getActivityState: (
      threadId: string,
    ) => { readonly lastActivityAtMs: number; readonly pendingToolCount: number } | undefined;
  };
  readonly clock?: ThreadSilenceWatchClock;
  readonly tickMs?: number;
  readonly onWarn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface ThreadSilenceWatchReactor {
  /** Handle one orchestration domain event (registration, cancel, stop, delete). */
  readonly handleEvent: (event: OrchestrationEvent) => Effect.Effect<void>;
  /** Fork the domain-event stream (scoped). */
  readonly startEventStream: () => Effect.Effect<Fiber.Fiber<void, never>, never, Scope.Scope>;
  /** Start the sweep timer. */
  readonly startSweeper: () => void;
  /**
   * Rebuild the pending index from persisted events, then seed/resolve. A
   * replay failure fails the layer (house style: durable-state rehydration
   * failures are fatal - the registered activities persist and re-replay on
   * the next start).
   */
  readonly rehydrate: Effect.Effect<void, OrchestrationEventStoreError>;
  readonly stop: () => void;
}

export const makeThreadSilenceWatchReactor = (
  deps: ThreadSilenceWatchReactorDeps,
): ThreadSilenceWatchReactor => {
  const index = makeThreadSilenceWatchIndex();
  // Shared terminal-notify dedup ledger (GHE #157): the watcher reports a
  // watch's terminal stop once per epoch; the marker is durable on the watcher
  // and rehydrated at boot. The observed (resume) thread is the watch target.
  const dedup = makeTerminalNotifyLedger({
    engine: deps.engine,
    markerKind: SILENCE_WATCH_TERMINAL_NOTIFIED_KIND,
    markerCommandPrefix: "server:t3team:silence-watch-terminal-marker",
    markerSummary: "Watched thread terminal state reported",
  });
  const emitter: ThreadSilenceWatchEmitter = makeThreadSilenceWatchEmitter({
    engine: deps.engine,
    query: deps.query,
    index,
    dedup,
    getActivityState: (threadId) => deps.watchdog.getActivityState(threadId),
    seedActivity: deps.watchdog.seedActivity,
  });

  const handleEvent = (event: OrchestrationEvent): Effect.Effect<void> => {
    switch (event.type) {
      case "thread.activity-appended": {
        const action = parseThreadSilenceWatchEvent(event);
        if (action?.type === "registered") {
          return emitter.onRegistered(action.record, event.sequence);
        }
        if (action?.type === "cancelled") {
          for (const record of index.forTarget(action.targetThreadId)) {
            if (record.watcherThreadId === action.watcherThreadId) {
              index.remove(record.watchId);
            }
          }
          return Effect.void;
        }
        return Effect.void;
      }
      case "thread.session-set": {
        const payload = event.payload as {
          readonly threadId: string;
          readonly session?: { readonly status?: string } | null;
        };
        const status = payload.session?.status;
        if (status === undefined) return Effect.void;
        const threadId = payload.threadId;
        if (status === "running" || status === "starting") {
          // A resumed target starts a fresh epoch: its stopped watches re-notify.
          dedup.noteResume(threadId, event.sequence);
          return Effect.void;
        }
        if (sessionStatusToWaitOutcome(status) === null) return Effect.void;
        return emitter.resolveStopped(threadId, status, event.sequence);
      }
      case "thread.deleted": {
        const threadId = (event.payload as { readonly threadId: string }).threadId;
        // The target: close its watches with a stopped notification. The
        // watcher: its watches are dead with it - drop them without noise.
        for (const record of index.all()) {
          if (record.watcherThreadId === threadId) {
            index.remove(record.watchId);
          }
        }
        return emitter.resolveStopped(threadId, "deleted", event.sequence);
      }
      default:
        return Effect.void;
    }
  };

  const handleSafely = (event: OrchestrationEvent) =>
    handleEvent(event).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
        return Effect.logWarning("t3team thread-silence watch reactor failed to process event", {
          eventType: event.type,
          cause: Cause.pretty(cause),
        });
      }),
    );

  const sweeper = makeThreadSilenceWatchSweeper({
    index,
    getActivityState: (threadId) => deps.watchdog.getActivityState(threadId),
    notifyDue: async (watches, nowMs) => {
      for (const record of watches) {
        await Effect.runPromise(emitter.emitSilence(record, nowMs));
      }
    },
    ...(deps.clock !== undefined ? { clock: deps.clock } : {}),
    ...(deps.tickMs !== undefined ? { tickMs: deps.tickMs } : {}),
    ...(deps.onWarn !== undefined ? { onWarn: deps.onWarn } : {}),
  });

  return {
    handleEvent,
    startEventStream: () =>
      Effect.forkScoped(Stream.runForEach(deps.engine.streamDomainEvents, handleSafely)),
    startSweeper: () => sweeper.start(),
    rehydrate: Effect.gen(function* () {
      const replayed: ReadonlyArray<OrchestrationEvent> = yield* Stream.runCollect(
        deps.engine.readEvents(0, Number.MAX_SAFE_INTEGER),
      ).pipe(Effect.map((chunk) => Array.from(chunk)));
      dedup.rehydrate(replayed);
      for (const record of collectPendingThreadSilenceWatches(replayed)) {
        yield* emitter.onRegistered(record, 0);
      }
    }),
    stop: () => sweeper.stop(),
  };
};

export const T3TeamThreadSilenceWatchReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const watchdog = yield* ThreadSilenceWatchdogService;
    const reactor = makeThreadSilenceWatchReactor({ engine, query, watchdog });
    yield* reactor.startEventStream();
    reactor.startSweeper();
    yield* reactor.rehydrate;
    yield* Effect.addFinalizer(() => Effect.sync(() => reactor.stop()));
  }),
);
