/**
 * The ONE inter-agent mailbox service of the process: durable store
 * (t3team-actorMailbox.ts), send (t3team-actorMailboxSend.ts) and delivery
 * (t3team-actorMailboxDelivery.ts) over the V2 thread runtime.
 *
 * Delivery keeps per-process state (one drain per thread at a time, the
 * once-per-session standing protocol), so every consumer must share this
 * instance: the reactor, the `t3_thread_send` mailbox hook and the
 * `t3team_children op:"drain"` port all reach it through
 * `T3TeamActorMailboxLive` (one layer reference, memoized).
 *
 * @module t3team-actorMailboxService
 */
import { type OrchestratorMcpFailure, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type {
  ThreadMailboxSendInput,
  ThreadMailboxSendResult,
} from "./mcp/t3team-threadMailboxDelivery.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import {
  T3TeamActorMailboxStore,
  T3TeamActorMailboxStoreLive,
  type T3TeamActorMailboxError,
} from "./t3team-actorMailbox.ts";
import { makeMailboxDelivery, type MailboxDrainOutcome } from "./t3team-actorMailboxDelivery.ts";
import { makeMailboxSend } from "./t3team-actorMailboxSend.ts";
import {
  resolveActorMessageBatchMax,
  resolveActorMessageDebounceMs,
} from "./t3team-actorMessageReactorLimits.ts";
import { T3TeamThreadEngagement, T3TeamThreadEngagementLive } from "./t3team-threadEngagement.ts";
import * as ThreadMessageRecorder from "./t3team-v2/t3team-threadMessageRecorder.ts";

export class T3TeamActorMailbox extends Context.Service<
  T3TeamActorMailbox,
  {
    readonly send: (
      input: ThreadMailboxSendInput,
    ) => Effect.Effect<ThreadMailboxSendResult, OrchestratorMcpFailure>;
    /** Delivers a thread's due messages; `force` skips the coalescing window and typing back-off. */
    readonly drain: (
      threadId: string,
      options?: { readonly force: boolean },
    ) => Effect.Effect<MailboxDrainOutcome, T3TeamActorMailboxError>;
    readonly store: T3TeamActorMailboxStore["Service"];
  }
>()("t3/t3team-actorMailboxService/T3TeamActorMailbox") {}

const make = Effect.gen(function* () {
  const threads = yield* ThreadManagementService;
  const store = yield* T3TeamActorMailboxStore;
  const recorder = yield* ThreadMessageRecorder.T3TeamThreadMessageRecorder;
  const engagement = yield* T3TeamThreadEngagement;
  const scope = yield* Effect.scope;

  const loadShell = (threadId: string) =>
    threads.getThreadShell(ThreadId.make(threadId)).pipe(Effect.orElseSucceed(() => null));

  const delivery = makeMailboxDelivery({
    store,
    loadThread: loadShell,
    loadMessages: (threadId) =>
      threads
        .getThreadRecords(ThreadId.make(threadId), ["messages"], {
          messageRoles: ["user", "assistant"],
        })
        .pipe(
          Effect.map((records) => records.messages),
          Effect.orElseSucceed(() => []),
        ),
    dispatch: (command) => threads.dispatch(command).pipe(Effect.mapError(String)),
    isEngaged: (threadId) => engagement.isEngaged(threadId),
    debounceMs: resolveActorMessageDebounceMs(),
    batchMax: resolveActorMessageBatchMax(),
    nowMillis: () => DateTime.toEpochMillis(DateTime.nowUnsafe()),
  });

  const drain = (threadId: string, options?: { readonly force: boolean }) =>
    delivery.drain(threadId, options);

  const send = makeMailboxSend({
    store,
    loadSender: (threadId) =>
      threads.getThreadRecords(threadId, ["runs"]).pipe(
        Effect.map(({ thread, runs }) => ({ title: thread.title, runs })),
        Effect.orElseSucceed(() => null),
      ),
    recordMessage: recorder.record,
    // A send never waits on delivery: the drain runs on its own fiber.
    nudge: (threadId) =>
      drain(threadId).pipe(
        Effect.catchCause((cause) => Effect.logWarning("t3team mailbox drain failed", { cause })),
        Effect.forkIn(scope),
        Effect.asVoid,
      ),
    nowIso: () => DateTime.formatIso(DateTime.nowUnsafe()),
  });

  return T3TeamActorMailbox.of({ send, drain, store });
});

// The recorder and engagement layers are the same references the runtime registers
// (T3TeamV2FoundationLive, server.ts), so memoization hands this service those instances.
export const T3TeamActorMailboxLive = Layer.effect(T3TeamActorMailbox, make).pipe(
  Layer.provide(
    Layer.mergeAll(
      T3TeamActorMailboxStoreLive,
      T3TeamThreadEngagementLive,
      ThreadMessageRecorder.layer,
    ),
  ),
);
