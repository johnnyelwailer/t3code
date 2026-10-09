/**
 * The queued-turn stall emission leaf: tell a delegated child's parent that
 * the child is stuck in the provider queue (an URGENT `thread.actor.message`,
 * the same channel as the abnormal-stop notice in
 * t3team-childAbnormalStopNotify.ts), then append the durable
 * QUEUED_TURN_STALL_NOTIFIED_KIND marker on the child. A thread with no
 * parent still gets the marker - it is the observability record and the
 * dedup fact the tracker rehydrates at boot.
 *
 * Non-terminal by design: the child is NOT settled or failed here; the
 * gateway may still start its turn.
 *
 * @module t3team-queuedTurnStallNotify
 */
import { CommandId, EventId, MessageId, NonNegativeInt, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { type ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { findHandoffParentThreadId } from "./t3team-childAbnormalStopNotify.ts";
import { QUEUED_TURN_STALL_NOTIFIED_KIND } from "./t3team-queuedTurnStall.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

/** The parent-facing notice: explicitly a stall, not a failure. */
export function buildQueuedTurnStallNotice(input: {
  readonly childTitle: string;
  readonly childThreadId: string;
  readonly stalledMs: number;
}): string {
  const minutes = Math.max(1, Math.round(input.stalledMs / 60_000));
  return (
    `[Child stalled in provider queue] Child «${input.childTitle}» (thread ${input.childThreadId}) ` +
    `has had a turn queued for about ${minutes} min without the provider starting it. ` +
    `It is stalled, not failed: the turn may still start later. ` +
    `You may nudge it (send it a message) or re-dispatch the work to a new child.`
  );
}

export interface QueuedTurnStallNotifyInput {
  readonly threadId: string;
  readonly epochKey: string;
  readonly requestSeq: number;
  readonly stalledMs: number;
}

export const makeQueuedTurnStallNotifier =
  (deps: {
    readonly engine: Pick<OrchestrationEngineShape, "dispatch">;
    readonly query: Pick<ProjectionSnapshotQueryShape, "getThreadDetailById">;
  }) =>
  (input: QueuedTurnStallNotifyInput): Effect.Effect<void> =>
    Effect.gen(function* () {
      const child = Option.getOrUndefined(
        yield* deps.query
          .getThreadDetailById(ThreadId.make(input.threadId))
          .pipe(Effect.orElseSucceed(() => Option.none())),
      );
      if (!child) return;
      const parentThreadId = findHandoffParentThreadId(child.activities);
      const nowIso = DateTime.formatIso(DateTime.nowUnsafe());
      if (parentThreadId !== null) {
        yield* deps.engine
          .dispatch({
            type: "thread.actor.message",
            commandId: CommandId.make(`server:t3team:queued-turn-stall:${t3teamRandomUUID()}`),
            threadId: ThreadId.make(parentThreadId),
            messageId: MessageId.make(t3teamRandomUUID()),
            fromThreadId: ThreadId.make(child.id),
            fromTitle: child.title,
            fromProjectId: child.projectId,
            text: buildQueuedTurnStallNotice({
              childTitle: child.title,
              childThreadId: String(child.id),
              stalledMs: input.stalledMs,
            }),
            // Urgent, like the abnormal-stop notice: the parent must hear now,
            // not after the idle coalescing window.
            urgency: "urgent",
            hopCount: NonNegativeInt.make(0),
            rootThreadId: ThreadId.make(parentThreadId),
            createdAt: nowIso,
          })
          .pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("queued-turn stall actor message failed", {
                threadId: input.threadId,
                parentThreadId,
                cause: Cause.pretty(cause),
              }),
            ),
          );
      }
      yield* deps.engine
        .dispatch({
          type: "thread.activity.append",
          commandId: CommandId.make(`server:t3team:queued-turn-stall-marker:${t3teamRandomUUID()}`),
          threadId: ThreadId.make(input.threadId),
          activity: {
            id: EventId.make(t3teamRandomUUID()),
            tone: "info",
            kind: QUEUED_TURN_STALL_NOTIFIED_KIND,
            summary:
              parentThreadId !== null
                ? "Queued turn stalled in provider; parent notified"
                : "Queued turn stalled in provider",
            payload: {
              epochKey: input.epochKey,
              requestSequence: input.requestSeq,
              stalledMs: input.stalledMs,
              parentThreadId,
            },
            turnId: null,
            createdAt: nowIso,
          },
          createdAt: nowIso,
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("queued-turn stall marker failed", {
              threadId: input.threadId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
    });
