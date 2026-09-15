import {
  CommandId,
  EventId,
  MessageId,
  NonNegativeInt,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  buildSilenceMessageText,
  THREAD_SILENCE_DETECTED_KIND,
  type ThreadSilenceDetectedPayload,
  type ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";
import type {
  ThreadShellLike,
  ThreadSilenceWatchDetectedDeps,
} from "./t3team-threadSilenceWatchEmitTypes.ts";

/**
 * The silence emission leaf: dispatch the inter-agent actor message on the
 * watching thread plus the durable `t3team.thread_silence.detected` activity.
 * Extracted from the emitter so the composer stays under the LOC cap and the
 * leaf is testable in isolation.
 *
 * @module t3team-threadSilenceWatchEmitDetected
 */
export const emitSilenceDetected = (
  deps: ThreadSilenceWatchDetectedDeps,
  record: ThreadSilenceWatchRecord,
  payload: ThreadSilenceDetectedPayload,
  nowIso: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const target = Option.getOrUndefined(
      yield* deps.query
        .getThreadShellById(ThreadId.make(record.targetThreadId))
        .pipe(Effect.orElseSucceed(() => Option.none())),
    ) as ThreadShellLike | null | undefined;
    const text = buildSilenceMessageText(payload);
    yield* deps.engine
      .dispatch({
        type: "thread.actor.message",
        commandId: CommandId.make(`server:t3team:thread-silence:${record.watchId}:${t3teamRandomUUID()}`),
        threadId: ThreadId.make(record.watcherThreadId),
        messageId: MessageId.make(t3teamRandomUUID()),
        fromThreadId: ThreadId.make(record.targetThreadId),
        fromTitle: target?.title ?? record.targetTitle,
        fromProjectId: target ? target.projectId : ProjectId.make(record.watcherThreadId),
        text,
        urgency: "normal",
        hopCount: NonNegativeInt.make(0),
        rootThreadId: ThreadId.make(record.watcherThreadId),
        createdAt: nowIso,
      })
      .pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("thread-silence actor message failed", {
            watchId: record.watchId,
            cause: Cause.pretty(cause),
          }),
        ),
      );
    yield* deps.engine
      .dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make(`server:t3team:thread-silence:${record.watchId}:${t3teamRandomUUID()}`),
        threadId: ThreadId.make(record.watcherThreadId),
        activity: {
          id: EventId.make(t3teamRandomUUID()),
          tone: "info",
          kind: THREAD_SILENCE_DETECTED_KIND,
          summary:
            payload.reason === "stopped"
              ? `Watched thread stopped: ${record.targetTitle}`
              : `Watched thread silent: ${record.targetTitle}`,
          payload,
          turnId: null,
          createdAt: nowIso,
        },
        createdAt: nowIso,
      })
      .pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("thread-silence detected activity failed", {
            watchId: record.watchId,
            cause: Cause.pretty(cause),
          }),
        ),
      );
  });
