/**
 * Production wiring of the thread silence watch: ONE core instance per process
 * (`T3TeamThreadSilenceWatchLive`, memoized by layer reference) shared by
 *
 * - `T3TeamSilenceWatchPortLive` — the `t3_task_ops op:"watch"/"unwatch"`
 *   port (provided to the tool broker layer in server.ts);
 * - `T3TeamThreadSilenceWatchReactorLive` — the live domain-event reactor and
 *   the durable sweep (a `Scheduler` source: 5 s tick, first run at start, which
 *   is the restart rehydrate).
 *
 * @module t3team-threadSilenceWatchReactorLive
 */
import { ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import * as Scheduler from "./scheduling/Scheduler.ts";
import { forkParked } from "./serverActivation.ts";
import { T3TeamActorMailbox, T3TeamActorMailboxLive } from "./t3team-actorMailboxService.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { SILENCE_TOOL_ITEM_TYPES } from "./t3team-threadSilenceWatchActivity.ts";
import {
  makeThreadSilenceWatchCore,
  type ThreadSilenceWatchCore,
} from "./t3team-threadSilenceWatchReactor.ts";
import {
  T3TeamThreadSilenceWatchStore,
  T3TeamThreadSilenceWatchStoreLive,
} from "./t3team-threadSilenceWatchStore.ts";
import { T3TeamSilenceWatchPort } from "./t3team-toolBrokerChildrenPorts.ts";

export class T3TeamThreadSilenceWatch extends Context.Service<
  T3TeamThreadSilenceWatch,
  ThreadSilenceWatchCore
>()("t3/t3team-threadSilenceWatchReactorLive/T3TeamThreadSilenceWatch") {}

const T3TeamThreadSilenceWatchLive = Layer.effect(
  T3TeamThreadSilenceWatch,
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const mailbox = yield* T3TeamActorMailbox;
    const store = yield* T3TeamThreadSilenceWatchStore;
    return yield* makeThreadSilenceWatchCore({
      store,
      loadShell: (threadId) =>
        threads.getThreadShell(ThreadId.make(threadId)).pipe(Effect.orElseSucceed(() => null)),
      loadActiveToolItemIds: (threadId) =>
        threads
          .getThreadRecords(ThreadId.make(threadId), ["turnItems"], {
            turnItemTypes: SILENCE_TOOL_ITEM_TYPES,
            turnItemStatuses: ["pending", "running", "waiting"],
          })
          .pipe(
            Effect.map((records) => records.turnItems.map((item) => item.id)),
            Effect.orElseSucceed(() => []),
          ),
      send: mailbox.send,
      newWatchId: () => `silence-watch:${t3teamRandomUUID()}`,
    });
  }),
).pipe(Layer.provide(Layer.mergeAll(T3TeamThreadSilenceWatchStoreLive, T3TeamActorMailboxLive)));

export const T3TeamSilenceWatchPortLive = Layer.effect(
  T3TeamSilenceWatchPort,
  Effect.map(T3TeamThreadSilenceWatch, (watch) => ({
    watch: { register: watch.register, cancel: watch.cancel },
  })),
).pipe(Layer.provide(T3TeamThreadSilenceWatchLive));

export const T3TeamThreadSilenceWatchReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const scheduler = yield* Scheduler.Scheduler;
    const watch = yield* T3TeamThreadSilenceWatch;
    yield* forkParked(
      Stream.runForEach(threads.streamDomainEvents, (event) =>
        watch.handleEvent(event).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.interrupt
              : Effect.logWarning("thread silence watch event failed", {
                  eventType: event.type,
                  cause: Cause.pretty(cause),
                }),
          ),
        ),
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("thread silence watch stream ended", { cause: Cause.pretty(cause) }),
        ),
      ),
    );
    yield* forkParked(scheduler.register("t3team-thread-silence-watch", watch.sweep));
  }),
).pipe(Layer.provide(Layer.mergeAll(T3TeamThreadSilenceWatchLive, Scheduler.layer)));
