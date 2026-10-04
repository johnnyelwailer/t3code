/**
 * Drives inter-agent mailbox delivery (t3team-actorMailboxService.ts) from V2
 * state:
 *
 * - a run of a thread ending → try that thread's digest now;
 * - a user Stop (`run_interrupt_request` turn item from a client command, or
 *   a fork stop cascade) → hold the thread's delivery, so a digest cannot
 *   re-open the turn the user just stopped;
 * - a message the user typed (`role: "user"`, `createdBy: "user"`) → lift
 *   the holds of the thread and of its held descendants, then deliver;
 * - a durable sweep (`Scheduler.register`, 5 s tick) → deliver every due
 *   digest. The sweep is what makes delivery restart-safe: it derives due
 *   work from the mailbox table, never from the live event tail.
 *
 * The reactor reads the LIVE tail only. Replaying history on boot would apply
 * old events to current durable state: an old user message would lift a hold
 * the user placed later and start a digest run in a thread they stopped.
 *
 * @module t3team-actorMessageReactor
 */
import {
  type OrchestrationV2StoredEvent,
  type OrchestrationV2ThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { EventSinkV2 } from "./orchestration-v2/EventSink.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import * as Scheduler from "./scheduling/Scheduler.ts";
import { forkParked } from "./serverActivation.ts";
import { T3TeamActorMailbox } from "./t3team-actorMailboxService.ts";
import { T3TeamEventSinkLayer } from "./t3team-v2/t3team-v2Layers.ts";

const CLIENT_COMMAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Command id prefix of the fork's "stop including sub-runs" cascade (a user stop, too). */
export const STOP_CASCADE_COMMAND_PREFIX = "t3team-cascade-stop:";

/** Client commands carry random UUIDs; server-issued ones are prefixed ids. */
export const isUserStopCommandId = (commandId: string | null): boolean =>
  commandId !== null &&
  (CLIENT_COMMAND_ID.test(commandId) || commandId.startsWith(STOP_CASCADE_COMMAND_PREFIX));

const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "interrupted",
  "cancelled",
  "rolled_back",
]);

/** Lineage depth searched when lifting a held descendant's hold. */
const MAX_LINEAGE_DEPTH = 16;

/** The reactor over whichever `EventSinkV2` the caller provides (tests: the harness sink). */
export const T3TeamActorMessageReactor = Layer.effectDiscard(
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const eventSink = yield* EventSinkV2;
    // The cursor is fixed when the layer builds, so nothing committed between boot and the
    // stream's subscription is missed (`stream()` replays (cursor, high water] first).
    const bootSequence = yield* eventSink.latestSequence().pipe(Effect.orDie);
    const mailbox = yield* T3TeamActorMailbox;
    const scheduler = yield* Scheduler.Scheduler;
    const scope = yield* Effect.scope;
    const logFailure =
      (message: string) =>
      <E>(cause: Cause.Cause<E>) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning(message, { cause: Cause.pretty(cause) });

    const drainSoon = (threadId: string) =>
      mailbox
        .drain(threadId)
        .pipe(
          Effect.catchCause(logFailure("t3team mailbox drain failed")),
          Effect.forkIn(scope),
          Effect.asVoid,
        );

    const isDescendantOf = (threadId: string, ancestorId: string) =>
      Effect.gen(function* () {
        let current: string | null = threadId;
        for (let depth = 0; current !== null && depth < MAX_LINEAGE_DEPTH; depth += 1) {
          const shell: OrchestrationV2ThreadShell | null = yield* threads
            .getThreadShell(ThreadId.make(current))
            .pipe(Effect.orElseSucceed(() => null));
          current = shell?.lineage.parentThreadId ?? null;
          if (current === ancestorId) return true;
        }
        return false;
      });

    const liftHolds = (threadId: string) =>
      Effect.gen(function* () {
        const held = yield* mailbox.store.heldThreads();
        const lifted: string[] = [];
        for (const heldId of held) {
          if (heldId === threadId || (yield* isDescendantOf(heldId, threadId))) lifted.push(heldId);
        }
        yield* mailbox.store.releaseHolds(lifted);
        yield* Effect.forEach(lifted, drainSoon, { discard: true });
      });

    const handle = ({ commandId, event }: OrchestrationV2StoredEvent) => {
      if (event.type === "run.updated" && TERMINAL_RUN_STATUSES.has(event.payload.status)) {
        return drainSoon(event.threadId);
      }
      if (
        event.type === "turn-item.updated" &&
        event.payload.type === "run_interrupt_request" &&
        isUserStopCommandId(commandId)
      ) {
        return mailbox.store.hold(event.threadId, DateTime.formatIso(DateTime.nowUnsafe()));
      }
      if (
        event.type === "message.updated" &&
        event.payload.role === "user" &&
        event.payload.createdBy === "user"
      ) {
        return liftHolds(event.threadId).pipe(Effect.andThen(drainSoon(event.threadId)));
      }
      return Effect.void;
    };

    const sweep = mailbox.store
      .threadsWithWork()
      .pipe(
        Effect.flatMap((threadIds) =>
          Effect.forEach(threadIds, (threadId) => mailbox.drain(threadId), { discard: true }),
        ),
      );

    yield* forkParked(scheduler.register("t3team-actor-mailbox", sweep));
    yield* forkParked(
      Stream.runForEach(eventSink.stream({ afterSequence: bootSequence }), (stored) =>
        handle(stored).pipe(Effect.catchCause(logFailure("t3team mailbox event handling failed"))),
      ).pipe(Effect.catchCause(logFailure("t3team mailbox event stream failed"))),
    );
  }),
).pipe(Layer.provide(Scheduler.layer));

/** Production: the runtime's ONE event sink, by layer reference (t3team-v2Layers.ts). */
export const T3TeamActorMessageReactorLive = T3TeamActorMessageReactor.pipe(
  Layer.provide(T3TeamEventSinkLayer),
);
