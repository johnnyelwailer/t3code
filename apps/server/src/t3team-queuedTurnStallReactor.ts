// @effect-diagnostics globalTimers:off -- the reactor owns the stall sweeper's host timer
// (injectable for tests), the same shape as the silence-watch sweeper.
/**
 * Queued-turn stall reaper: notice-only. Folds the live event stream into the
 * stall tracker (t3team-queuedTurnStall.ts), rehydrates it from the persisted
 * log at boot, and sweeps every 5s. A thread whose turn start has been queued
 * past the timeout - re-confirmed against the projection's own
 * `hasPendingTurnStart` (the probe GHE #343 uses to protect queued turns from
 * the session reaper) - is reported EXACTLY ONCE per stall epoch.
 *
 * Unlike ProviderSessionReaper this never stops, settles, or fails anything:
 * a stall is not terminal and the gateway may still start the turn.
 *
 * @module t3team-queuedTurnStallReactor
 */
import type { OrchestrationEvent } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  makeQueuedTurnStallTracker,
  QUEUED_TURN_STALL_SWEEP_INTERVAL_MS,
  QUEUED_TURN_STALL_TIMEOUT_MS,
  queuedTurnStallEpochKey,
} from "./t3team-queuedTurnStall.ts";
import { makeQueuedTurnStallNotifier } from "./t3team-queuedTurnStallNotify.ts";
import { defaultClock, type ThreadSilenceWatchClock } from "./t3team-threadSilenceWatchSweeper.ts";

export interface QueuedTurnStallReactorDeps {
  readonly engine: Pick<OrchestrationEngineShape, "dispatch" | "readEvents" | "streamDomainEvents">;
  readonly query: Pick<ProjectionSnapshotQueryShape, "getThreadDetailById" | "hasPendingTurnStart">;
  readonly clock?: ThreadSilenceWatchClock;
  readonly tickMs?: number;
  readonly timeoutMs?: number;
}

export const makeQueuedTurnStallReactor = (deps: QueuedTurnStallReactorDeps) => {
  const clock = deps.clock ?? defaultClock;
  const timeoutMs = deps.timeoutMs ?? QUEUED_TURN_STALL_TIMEOUT_MS;
  const tracker = makeQueuedTurnStallTracker();
  const notify = makeQueuedTurnStallNotifier(deps);
  let timer: unknown;
  let stopped = false;
  let sweeping = false;

  const sweep: Effect.Effect<void> = Effect.gen(function* () {
    const nowMs = clock.now();
    for (const entry of tracker.due(nowMs, timeoutMs)) {
      // The projection is authoritative: a request the fold could not see
      // cleared (e.g. a compaction) is dropped, not reported.
      const stillPending = yield* deps.query
        .hasPendingTurnStart(ThreadId.make(entry.threadId))
        .pipe(Effect.orElseSucceed(() => true));
      if (!stillPending) {
        tracker.drop(entry.threadId);
        continue;
      }
      const epochKey = queuedTurnStallEpochKey(entry);
      // Mark before dispatching so an overlapping sweep cannot double-report;
      // the durable marker the notifier appends carries it across restarts.
      tracker.markNotified(epochKey);
      yield* notify({
        threadId: entry.threadId,
        epochKey,
        requestSeq: entry.requestSeq,
        stalledMs: nowMs - (entry.sinceMs ?? nowMs),
      });
    }
  });

  const tick = async (): Promise<void> => {
    if (sweeping) return;
    sweeping = true;
    try {
      await Effect.runPromise(
        sweep.pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("queued-turn stall sweep failed", { cause: Cause.pretty(cause) }),
          ),
        ),
      );
    } finally {
      sweeping = false;
    }
  };

  return {
    handleEvent: (event: OrchestrationEvent): Effect.Effect<void> =>
      Effect.sync(() => tracker.fold(event)),
    startEventStream: () =>
      Effect.forkScoped(
        Stream.runForEach(deps.engine.streamDomainEvents, (event) =>
          Effect.sync(() => tracker.fold(event)),
        ),
      ),
    rehydrate: Stream.runForEach(deps.engine.readEvents(0, Number.MAX_SAFE_INTEGER), (event) =>
      Effect.sync(() => tracker.fold(event)),
    ),
    sweep,
    tick,
    startSweeper: () => {
      if (stopped || timer !== undefined) return;
      timer = clock.setTimer(() => void tick(), deps.tickMs ?? QUEUED_TURN_STALL_SWEEP_INTERVAL_MS);
    },
    stop: () => {
      stopped = true;
      if (timer !== undefined) clock.clearTimer(timer);
      timer = undefined;
    },
  };
};

export const T3TeamQueuedTurnStallReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const reactor = makeQueuedTurnStallReactor({ engine, query });
    yield* reactor.startEventStream();
    yield* reactor.rehydrate;
    reactor.startSweeper();
    yield* Effect.addFinalizer(() => Effect.sync(() => reactor.stop()));
  }),
);
