// @effect-diagnostics globalTimers:off -- the reactor owns the silence-watch sweeper's host
// timer (see t3team-threadSilenceWatchSweeper.ts).
/**
 * Event routing and durable rehydration for the thread silence watchdog.
 * Emission, indexing, sweeping, and live layer wiring live in focused sibling
 * modules.
 * @module t3team-threadSilenceWatchReactor
 */
import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { type OrchestrationEventStoreError } from "./persistence/Errors.ts";
import { type ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { type ThreadBackgroundLiveness } from "./orchestration/ThreadBackgroundLiveness.ts";
import {
  parseThreadSilenceWatchEvent,
  SILENCE_WATCH_TERMINAL_NOTIFIED_KIND,
} from "./t3team-threadSilenceWatch.ts";
import { makeTerminalNotifyLedger } from "./t3team-terminalNotifyDedup.ts";
import { makeThreadSilenceWatchEmitter } from "./t3team-threadSilenceWatchEmit.ts";
import type { ThreadSilenceWatchEmitter } from "./t3team-threadSilenceWatchEmitTypes.ts";
import { makeThreadSilenceWatchIndex } from "./t3team-threadSilenceWatchIndex.ts";
import { collectPendingThreadSilenceWatches } from "./t3team-threadSilenceWatchRehydrate.ts";
import { shouldStopSilenceWatch } from "./t3team-silenceWatchStop.ts";
import { makeThreadSilenceWatchStopRecheck } from "./t3team-threadSilenceWatchStopRecheck.ts";
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
  /**
   * Background liveness of a target thread (subagents, workflow runs,
   * background shells). A target whose turn ended (`ready`/`idle`) is only
   * STOPPED for watch purposes when nothing keeps it live - a thread resting
   * between turns while a job runs is waiting, not stopped.
   */
  readonly getLiveness?: (threadId: string) => ThreadBackgroundLiveness;
  readonly onWarn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface ThreadSilenceWatchReactor {
  readonly handleEvent: (event: OrchestrationEvent) => Effect.Effect<void>;
  readonly startEventStream: () => Effect.Effect<Fiber.Fiber<void, never>, never, Scope.Scope>;
  readonly startSweeper: () => void;
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
    ...(deps.getLiveness !== undefined ? { getLiveness: deps.getLiveness } : {}),
  });
  const stopRecheck = makeThreadSilenceWatchStopRecheck({
    query: deps.query,
    index,
    getLiveness: (threadId) => deps.getLiveness?.(threadId) ?? null,
    resolveStopped: (threadId, status, sequence) =>
      emitter.resolveStopped(threadId, status, sequence),
  });

  const handleEvent = (event: OrchestrationEvent): Effect.Effect<void> => {
    switch (event.type) {
      case "thread.activity-appended": {
        const action = parseThreadSilenceWatchEvent(event);
        if (action?.type === "registered") {
          return emitter
            .onRegistered(action.record, event.sequence)
            .pipe(
              Effect.tap(() =>
                Effect.sync(() => stopRecheck.forgetIfUnwatched(action.record.targetThreadId)),
              ),
            );
        }
        if (action?.type === "cancelled") {
          for (const record of index.forTarget(action.targetThreadId)) {
            if (record.watcherThreadId === action.watcherThreadId) {
              index.remove(record.watchId);
            }
          }
          stopRecheck.forgetIfUnwatched(action.targetThreadId);
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
        if (index.forTarget(threadId).length > 0) {
          stopRecheck.noteSession(threadId, status, event.sequence);
        }
        if (status === "running" || status === "starting") {
          // A resumed target starts a fresh epoch: its stopped watches re-notify.
          dedup.noteResume(threadId, event.sequence);
          return Effect.void;
        }
        // True terminals always stop the watch; `ready`/`idle` (turn ended,
        // thread alive) stop it only when no background work keeps the
        // thread live - otherwise it is waiting on a job/child, not stopped.
        if (!shouldStopSilenceWatch(status, deps.getLiveness?.(threadId) ?? null)) {
          return Effect.void;
        }
        return emitter
          .resolveStopped(threadId, status, event.sequence)
          .pipe(Effect.tap(() => Effect.sync(() => stopRecheck.forgetIfUnwatched(threadId))));
      }
      case "thread.deleted": {
        const threadId = (event.payload as { readonly threadId: string }).threadId;
        // The target: close its watches with a stopped notification. The
        // watcher: its watches are dead with it - drop them without noise.
        for (const record of index.all()) {
          if (record.watcherThreadId === threadId) {
            index.remove(record.watchId);
            stopRecheck.forgetIfUnwatched(record.targetThreadId);
          }
        }
        return emitter
          .resolveStopped(threadId, "deleted", event.sequence)
          .pipe(Effect.tap(() => Effect.sync(() => stopRecheck.forgetIfUnwatched(threadId))));
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
    beforeSweep: () => Effect.runPromise(stopRecheck.recheckPending),
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
