// @effect-diagnostics globalTimers:off -- owns the child-wait scheduler host timer.
/**
 * Live wiring for the durable child-wait (GHE #55): rehydrates the pending index
 * and the abnormal-stop dedup map by replaying persisted events, resolves waits
 * on `thread.session-set` / `thread.activity-appended`, (once per stop, GHE #157)
 * notifies the parent of an abnormal child stop, and arms the host timer. See
 * t3team-childAbnormalStopDedup.ts for the epoch-scoped dedup marker.
 *
 * Silent-completion notice (GHE #55 follow-up): the SAME path also covers a
 * child that completes without reporting — when no wait resolved, the notifier
 * tells the parent to decide (settle via `sweep`, or follow up) unless it
 * already got the child's report; the SAME epoch ledger dedups it.
 *
 * @module t3team-childWaitReactor
 */
import { ThreadId, type OrchestrationEvent } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { deriveThreadRunState, type ThreadRunState } from "@t3tools/shared/t3team-threadRunStatus";
import {
  CHILD_WAIT_REGISTERED_KIND,
  CHILD_WAIT_RESOLVED_KIND,
  collectPendingChildWaits,
  sessionStatusToWaitOutcome,
  type ChildWaitOn,
  type ChildWaitRecord,
} from "./t3team-childWait.ts";
import { makeAbnormalStopGuards } from "./t3team-childAbnormalStopDedup.ts";
import { makeChildWaitIndex } from "./t3team-childWaitIndex.ts";
import { makeChildWaitScheduler, type ChildWaitScheduler } from "./t3team-childWaitScheduler.ts";
import { makeResolveWait } from "./t3team-childWaitResolve.ts";
import { makeChildWaitTerminal } from "./t3team-childWaitTerminal.ts";

/** Map a derived run-state onto the terminal outcome we notify for (null when not terminal). */
function terminalFromRunState(state: ThreadRunState): "completed" | "failed" | "aborted" | null {
  return state === "completed" || state === "failed" || state === "aborted" ? state : null;
}

export const T3TeamChildWaitReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const index = makeChildWaitIndex();
    // Declared first so the closures below capture it before assignment.
    let scheduler: ChildWaitScheduler;
    const rearm = () => scheduler.rearm();
    const resolveWait = makeResolveWait({ engine, query, index, rearm });
    const { noteResume, notifyAbnormalStop, rehydrate } = makeAbnormalStopGuards({
      engine,
      query,
    });
    // Terminal-decision path (resolve matching waits, then notify the parent if
    // none did) lives in t3team-childWaitTerminal.ts; wired to the live index,
    // resolver, and ledger-guarded notifier here.
    const { resolveChildOutcome, notifyTerminalIfNoWait } = makeChildWaitTerminal({
      index,
      resolveWait,
      notifyAbnormalStop,
    });

    // A newly registered wait: index it; resolve now if the child is already terminal.
    const onRegistered = (record: ChildWaitRecord): Effect.Effect<void> =>
      Effect.gen(function* () {
        index.add(record);
        yield* Effect.promise(rearm);
        const child = Option.getOrUndefined(
          yield* query
            .getThreadShellById(ThreadId.make(record.childThreadId))
            .pipe(Effect.orElseSucceed(() => Option.none())),
        );
        if (!child) return;
        const state = deriveThreadRunState({
          session: child.session,
          latestTurn: child.latestTurn,
          ...(child.backgroundLiveness !== undefined
            ? { backgroundLiveness: child.backgroundLiveness }
            : {}),
        });
        const outcome = terminalFromRunState(state);
        if (outcome !== null) {
          yield* resolveChildOutcome(record.childThreadId, outcome);
        }
      });

    const handleEvent = (event: OrchestrationEvent): Effect.Effect<void> => {
      switch (event.type) {
        case "thread.activity-appended": {
          const activity = event.payload.activity;
          if (activity.kind === CHILD_WAIT_REGISTERED_KIND) {
            const payload = activity.payload as
              | {
                  readonly waitId?: unknown;
                  readonly childThreadId?: unknown;
                  readonly childTitle?: unknown;
                  readonly on?: unknown;
                  readonly deadlineIso?: unknown;
                }
              | null
              | undefined;
            if (
              !payload ||
              typeof payload.waitId !== "string" ||
              typeof payload.childThreadId !== "string"
            ) {
              return Effect.void;
            }
            const on: ChildWaitOn =
              payload.on === "completed" || payload.on === "failed" ? payload.on : "terminal";
            return onRegistered({
              waitId: payload.waitId,
              parentThreadId: event.payload.threadId,
              childThreadId: payload.childThreadId,
              childTitle: typeof payload.childTitle === "string" ? payload.childTitle : "child",
              on,
              ...(typeof payload.deadlineIso === "string"
                ? { deadlineIso: payload.deadlineIso }
                : {}),
            });
          }
          if (activity.kind === CHILD_WAIT_RESOLVED_KIND) {
            const payload = activity.payload as { readonly waitId?: unknown } | null | undefined;
            if (payload && typeof payload.waitId === "string") {
              index.remove(payload.waitId);
              return Effect.promise(rearm);
            }
            return Effect.void;
          }
          return Effect.void;
        }
        case "thread.session-set": {
          const status = event.payload.session.status;
          const outcome = sessionStatusToWaitOutcome(status);
          if (outcome === null) {
            // Epoch boundary: resuming the child (running/starting) lets a later stop re-notify.
            if (status === "running" || status === "starting") {
              noteResume(event.payload.threadId, event.sequence);
            }
            return Effect.void;
          }
          return notifyTerminalIfNoWait(event, outcome);
        }
        default:
          return Effect.void;
      }
    };

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
      resolveDue: async (records) => {
        for (const record of records) {
          await Effect.runPromise(resolveWait(record, "timeout"));
        }
      },
      onWarn: (message, fields) => {
        Effect.runFork(Effect.logWarning(message, fields ?? {}));
      },
    });

    // Rehydrate (pending index + abnormal-stop dedup map) BEFORE subscribing the
    // live stream, so a terminal session-set never resolves against an empty index.
    const replayed: ReadonlyArray<OrchestrationEvent> = yield* Stream.runCollect(
      engine.readEvents(0, Number.MAX_SAFE_INTEGER),
    ).pipe(Effect.map((chunk) => Array.from(chunk)));
    for (const record of collectPendingChildWaits(replayed)) {
      index.add(record);
    }
    rehydrate(replayed);
    yield* Effect.promise(rearm);

    // Live stream subscribed only after rehydration (index fully populated).
    yield* Effect.forkScoped(Stream.runForEach(engine.streamDomainEvents, handleSafely));

    yield* Effect.addFinalizer(() => Effect.sync(() => scheduler.stop()));
  }),
);
