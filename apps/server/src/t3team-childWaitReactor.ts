// @effect-diagnostics globalTimers:off -- the reactor owns the child-wait
// scheduler's host timer (see t3team-childWaitScheduler.ts).
/**
 * Live wiring for the durable child-wait (GHE #55): the `T3TeamChildWaitReactorLive`
 * layer that (1) rehydrates the pending index by replaying persisted events,
 * (2) reacts to `thread.session-set` and `thread.activity-appended` events to
 * resolve waits, and (3) arms the host timer for deadlines. Resolution delivery
 * (actor message + resolved activity) lives in t3team-childWaitResolve.ts.
 *
 * Abnormal-stop notification (GHE #157): when a child's session-set lands on an
 * abnormal terminal status AND no matching wait resolved for it, the parent is
 * told via a standalone actor message (t3team-childAbnormalStopNotify.ts) — a
 * dead child is never silent, even when the parent never registered a wait.
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
import { deriveThreadRunState } from "@t3tools/shared/t3team-threadRunStatus";
import {
  CHILD_WAIT_REGISTERED_KIND,
  CHILD_WAIT_RESOLVED_KIND,
  childWaitOutcomeMatches,
  collectPendingChildWaits,
  sessionStatusToWaitOutcome,
  type ChildWaitOn,
  type ChildWaitOutcome,
  type ChildWaitRecord,
} from "./t3team-childWait.ts";
import { makeChildAbnormalStopNotifier } from "./t3team-childAbnormalStopNotify.ts";
import { makeChildWaitIndex } from "./t3team-childWaitIndex.ts";
import { makeChildWaitScheduler, type ChildWaitScheduler } from "./t3team-childWaitScheduler.ts";
import { makeResolveWait } from "./t3team-childWaitResolve.ts";

export const T3TeamChildWaitReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const index = makeChildWaitIndex();
    // Assigned after the resolve functions below (which reference it); declared
    // first so the closures capture the binding without a use-before-declaration.
    let scheduler: ChildWaitScheduler;
    const rearm = () => scheduler.rearm();
    const resolveWait = makeResolveWait({ engine, query, index, rearm });
    const notifyAbnormalStop = makeChildAbnormalStopNotifier({ engine, query });

    // Resolves every pending wait matching the child+outcome; returns how many
    // resolved so the caller can dedup the standalone abnormal-stop message.
    const resolveChildOutcome = (
      childThreadId: string,
      outcome: ChildWaitOutcome,
    ): Effect.Effect<number> =>
      Effect.gen(function* () {
        const matching = index
          .forChild(childThreadId)
          .filter((record) => childWaitOutcomeMatches(outcome, record.on));
        for (const record of matching) {
          yield* resolveWait(record, outcome);
        }
        return matching.length;
      });

    // A newly registered wait: index it, then resolve immediately if the child
    // is ALREADY in a matching terminal state (no upcoming event will fire).
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
        const outcome =
          state === "completed"
            ? "completed"
            : state === "failed"
              ? "failed"
              : state === "aborted"
                ? "aborted"
                : null;
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
          const outcome = sessionStatusToWaitOutcome(event.payload.session.status);
          if (outcome === null) return Effect.void;
          return resolveChildOutcome(event.payload.threadId, outcome).pipe(
            Effect.flatMap((resolvedWaits) => {
              // Normal completion: the child reports its own result — no note.
              if (outcome === "completed") return Effect.void;
              // A wait already resolved for this child+outcome: its resolution
              // message (carrying the abnormal detail) already told the parent.
              if (resolvedWaits > 0) return Effect.void;
              // Abnormal stop with no matching wait: without this the parent
              // would never learn the child died (GHE #157).
              return notifyAbnormalStop({
                childThreadId: event.payload.threadId,
                outcome,
                lastError: event.payload.session.lastError,
              });
            }),
          );
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

    yield* Effect.forkScoped(Stream.runForEach(engine.streamDomainEvents, handleSafely));

    // Rehydrate: replay persisted events to rebuild the pending index, then
    // re-arm the timer for any surviving deadline.
    const replayed: ReadonlyArray<OrchestrationEvent> = yield* Stream.runCollect(
      engine.readEvents(0, Number.MAX_SAFE_INTEGER),
    ).pipe(Effect.map((chunk) => Array.from(chunk)));
    for (const record of collectPendingChildWaits(replayed)) {
      index.add(record);
    }
    yield* Effect.promise(rearm);

    yield* Effect.addFinalizer(() => Effect.sync(() => scheduler.stop()));
  }),
);
