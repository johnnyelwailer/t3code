// @effect-diagnostics globalTimers:off -- owns the child-wait scheduler and completion
// quiet-period host timers.
/**
 * Live wiring for the durable child-wait (GHE #55): rehydrates the pending index
 * and the abnormal-stop dedup map by replaying persisted events, resolves waits
 * on `thread.session-set` / `thread.activity-appended`, and notifies the parent
 * of a child's terminal stop — deduped by the shared ledger, once per terminal
 * epoch (GHE #157).
 *
 * Two kinds of terminal, handled differently:
 * - **Abnormal stop** (error / interrupted / stopped): a genuine terminal. The
 *   ledger-guarded notifier fires immediately (urgent), so a dead child is never
 *   silent.
 * - **Silent completion** (idle / ready): `ready` is inter-turn IDLE, not "done"
 *   — a multi-turn agent goes running -> ready -> running between turns. So this
 *   notice is deferred behind a quiet period (the child must stay quiet, no new
 *   turn, for `COMPLETION_QUIET_PERIOD_MS`) before the notifier prompts the
 *   parent to decide; a resume cancels it. When it does fire it is non-urgent so
 *   it joins the automated-message burst fold.
 *
 * `makeChildWaitReactor` is the testable factory (injectable clock + quiet
 * period); `T3TeamChildWaitReactorLive` is the thin production layer. Event
 * routing lives in t3team-childWaitEventRouter.ts; the timing gate in
 * t3team-childCompletionQuiet.ts; the epoch ledger in
 * t3team-childAbnormalStopDedup.ts.
 *
 * @module t3team-childWaitReactor
 */
import { type OrchestrationEvent } from "@t3tools/contracts";
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
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { type OrchestrationEventStoreError } from "./persistence/Errors.ts";
import { collectPendingChildWaits, type ChildWaitRecord } from "./t3team-childWait.ts";
import { makeAbnormalStopGuards } from "./t3team-childAbnormalStopDedup.ts";
import { makeChildCompletionQuiet } from "./t3team-childCompletionQuiet.ts";
import { makeChildWaitEventRouter } from "./t3team-childWaitEventRouter.ts";
import { makeChildWaitIndex } from "./t3team-childWaitIndex.ts";
import {
  makeChildWaitScheduler,
  type ChildWaitClock,
  type ChildWaitScheduler,
} from "./t3team-childWaitScheduler.ts";
import { makeResolveWait } from "./t3team-childWaitResolve.ts";
import { makeChildWaitTerminal } from "./t3team-childWaitTerminal.ts";

export interface ChildWaitReactorDeps {
  readonly engine: OrchestrationEngineShape;
  readonly query: ProjectionSnapshotQueryShape;
  /** One clock for the wait-deadline scheduler and the completion quiet gate. */
  readonly clock?: ChildWaitClock;
  /** Override the default completion quiet period (tests drive it deterministically). */
  readonly quietPeriodMs?: number;
  readonly onWarn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface ChildWaitReactor {
  /** Handle one orchestration domain event (wait register/resolve, session-set). */
  readonly handleEvent: (event: OrchestrationEvent) => Effect.Effect<void>;
  /** Fork the domain-event stream (scoped). */
  readonly startEventStream: () => Effect.Effect<Fiber.Fiber<void, never>, never, Scope.Scope>;
  /**
   * Rebuild the pending index + abnormal-stop ledger from persisted events, then
   * arm the scheduler. A replay failure fails the layer (house style).
   */
  readonly rehydrate: Effect.Effect<void, OrchestrationEventStoreError>;
  readonly stop: () => void;
}

export function makeChildWaitReactor(deps: ChildWaitReactorDeps): ChildWaitReactor {
  const { engine, query } = deps;
  const index = makeChildWaitIndex();
  let scheduler: ChildWaitScheduler;
  const rearm = () => scheduler.rearm();
  const resolveWait = makeResolveWait({ engine, query, index, rearm });
  const {
    noteResume,
    notifyAbnormalStop,
    rehydrate: ledgerRehydrate,
  } = makeAbnormalStopGuards({
    engine,
    query,
  });
  const { resolveChildOutcome, notifyTerminalIfNoWait } = makeChildWaitTerminal({
    index,
    resolveWait,
    notifyAbnormalStop,
  });
  // A settled child becomes eligible for the silent-completion notice only after
  // it has stayed quiet for the quiet period; a resume cancels the pending timer.
  const quiet = makeChildCompletionQuiet({
    ...(deps.clock !== undefined ? { clock: deps.clock } : {}),
    ...(deps.quietPeriodMs !== undefined ? { quietPeriodMs: deps.quietPeriodMs } : {}),
    onQuiet: (childThreadId, settleSeq) =>
      Effect.runPromise(
        notifyTerminalIfNoWait({
          childThreadId,
          outcome: "completed",
          lastError: null,
          eventSequence: settleSeq,
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("t3team child-wait quiet-period completion notice failed", {
              childThreadId,
              cause: Cause.pretty(cause),
            }),
          ),
        ),
      ),
  });

  const { handleEvent } = makeChildWaitEventRouter({
    index,
    rearm,
    query,
    resolveChildOutcome,
    noteResume,
    quiet,
    notifyTerminalIfNoWait,
  });

  const handleSafely = (event: OrchestrationEvent) =>
    handleEvent(event).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
        return Effect.logWarning("t3team child-wait reactor failed to process event", {
          eventType: event.type,
          cause: Cause.pretty(cause),
        });
      }),
    );

  scheduler = makeChildWaitScheduler({
    index,
    ...(deps.clock !== undefined ? { clock: deps.clock } : {}),
    resolveDue: async (records) => {
      for (const record of records) {
        await Effect.runPromise(resolveWait(record, "timeout"));
      }
    },
    ...(deps.onWarn !== undefined
      ? {
          onWarn: (message: string, fields?: Record<string, unknown>) =>
            deps.onWarn?.(message, fields),
        }
      : {}),
  });

  // Rehydrate (pending index + abnormal-stop ledger) BEFORE the caller subscribes
  // the live stream, so a terminal session-set never resolves against an empty index.
  const rehydrate = Effect.gen(function* () {
    const replayed: ReadonlyArray<OrchestrationEvent> = yield* Stream.runCollect(
      engine.readEvents(0, Number.MAX_SAFE_INTEGER),
    ).pipe(Effect.map((chunk) => Array.from(chunk)));
    for (const record of collectPendingChildWaits(replayed)) {
      index.add(record);
    }
    ledgerRehydrate(replayed);
    yield* Effect.promise(rearm);
  });

  return {
    handleEvent,
    startEventStream: () =>
      Effect.forkScoped(Stream.runForEach(engine.streamDomainEvents, handleSafely)),
    rehydrate,
    stop: () => {
      scheduler.stop();
      quiet.stop();
    },
  };
}

export const T3TeamChildWaitReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const reactor = makeChildWaitReactor({ engine, query });
    yield* reactor.rehydrate;
    yield* reactor.startEventStream();
    yield* Effect.addFinalizer(() => Effect.sync(() => reactor.stop()));
  }),
);
