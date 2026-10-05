/**
 * Run-less message writes (critic G6): records a user, assistant or system
 * message on a thread without starting a run. Replaces the V1 internal
 * `thread.message.upsert` for every plain-text producer.
 *
 * - Idempotent: the caller supplies a deterministic `messageId`; the turn item
 *   id derives from it. Re-recording identical content writes nothing.
 * - Placement: the item takes the next position after the thread's latest run
 *   so a note written mid-conversation shows where it happened (a run-less item
 *   would otherwise sort before every run).
 * - Roles: `system` renders as a `system_notice` item and does not steer title
 *   generation or handoffs; prefer it for fork notes. Use `user` only for text a
 *   person (or a person-equivalent tool) said; `context` rides on user items.
 * - Locking: takes the thread lock itself. Never call it from code that already
 *   holds the same thread's lock or from inside an orchestrator dispatch.
 */
import type { MessageId, TurnItemId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as IdAllocator from "../orchestration-v2/IdAllocator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ThreadCommandExecutor from "../orchestration-v2/ThreadCommandExecutor.ts";
import * as TurnItemPositionStore from "../orchestration-v2/TurnItemPositionStore.ts";
import {
  buildRunlessMessagePayloads,
  isSameRecordedMessage,
  type RecordThreadMessageInput,
  recorderTurnItemId,
} from "./t3team-threadMessagePayloads.ts";
import { T3TeamV2WriterLayerLive } from "./t3team-v2Layers.ts";

export {
  recorderTurnItemId,
  type RecordThreadMessageInput,
} from "./t3team-threadMessagePayloads.ts";

export class T3TeamThreadMessageRecorderError extends Schema.TaggedError<T3TeamThreadMessageRecorderError>()(
  "T3TeamThreadMessageRecorderError",
  { threadId: Schema.String, messageId: Schema.String, cause: Schema.Defect() },
) {}

export interface RecordThreadMessageResult {
  readonly messageId: MessageId;
  readonly turnItemId: TurnItemId;
  /** False when the identical message was already recorded. */
  readonly recorded: boolean;
}

const isRecorderError = Schema.is(T3TeamThreadMessageRecorderError);

export class T3TeamThreadMessageRecorder extends Context.Service<
  T3TeamThreadMessageRecorder,
  {
    readonly record: (
      input: RecordThreadMessageInput,
    ) => Effect.Effect<RecordThreadMessageResult, T3TeamThreadMessageRecorderError>;
  }
>()("t3/t3team-v2/t3team-threadMessageRecorder/T3TeamThreadMessageRecorder") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const locks = yield* ThreadCommandExecutor.ThreadCommandExecutor;
  const sink = yield* EventSink.EventSinkV2;
  const ids = yield* IdAllocator.IdAllocatorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const positions = yield* TurnItemPositionStore.TurnItemPositionStoreV2;

  const recordLocked = (input: RecordThreadMessageInput) =>
    Effect.gen(function* () {
      const turnItemId = recorderTurnItemId(input.messageId);
      const thread = yield* projections.getThread(input.threadId);
      if (thread.deletedAt !== null) {
        return yield* new T3TeamThreadMessageRecorderError({
          threadId: input.threadId,
          messageId: input.messageId,
          cause: "thread is deleted",
        });
      }
      const { messages } = yield* projections.getThreadRecords(input.threadId, ["messages"], {
        messageIds: [input.messageId],
      });
      const existing = messages.find((message) => message.id === input.messageId);
      if (existing !== undefined && isSameRecordedMessage(existing, input)) {
        return { messageId: input.messageId, turnItemId, recorded: false };
      }
      const now = yield* DateTime.now;
      const latestRun = yield* sql<{ readonly ordinal: number | null }>`
        SELECT MAX(ordinal) AS ordinal FROM orchestration_v2_projection_runs
        WHERE thread_id = ${input.threadId}
      `;
      const runOrdinal = latestRun[0]?.ordinal ?? null;
      // An existing item keeps its position; a new one lands after the latest run's items.
      const ordinal = yield* positions.allocate({
        threadId: input.threadId,
        turnItemId,
        runId: null,
        ...(runOrdinal === null ? {} : { runOrdinal }),
      });
      const { message, turnItem } = buildRunlessMessagePayloads({
        message: input,
        ordinal,
        createdAt: existing?.createdAt ?? now,
        now,
      });
      const eventId = () => ids.allocate.event({ threadId: input.threadId });
      yield* sink.write({
        events: [
          {
            id: yield* eventId(),
            type: "message.updated",
            threadId: input.threadId,
            occurredAt: now,
            payload: message,
          },
          {
            id: yield* eventId(),
            type: "turn-item.updated",
            threadId: input.threadId,
            occurredAt: now,
            payload: turnItem,
          },
        ],
      });
      return { messageId: input.messageId, turnItemId, recorded: true };
    });

  const record = (input: RecordThreadMessageInput) =>
    locks.withLock(input.threadId, recordLocked(input)).pipe(
      Effect.mapError((cause) =>
        isRecorderError(cause)
          ? cause
          : new T3TeamThreadMessageRecorderError({
              threadId: input.threadId,
              messageId: input.messageId,
              cause,
            }),
      ),
      Effect.withSpan("t3team.threadMessageRecorder.record"),
    );

  return T3TeamThreadMessageRecorder.of({ record });
});

/** Provides the recorder over the runtime's shared lock and sink (by reference). */
export const layer = Layer.effect(T3TeamThreadMessageRecorder, make).pipe(
  Layer.provide(T3TeamV2WriterLayerLive),
);
