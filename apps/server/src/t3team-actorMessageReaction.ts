/**
 * Turns one claimed mailbox BATCH of entries into a single `thread.turn.start`
 * reaction turn (framed `actor` input, `visibleToUser: false`) — see
 * t3team-actorMessageReactor.ts, which owns claim/drain and calls this once a
 * thread is confirmed idle and unsuppressed. A one-entry batch is framed
 * exactly like the historical single-message delivery.
 *
 * @module t3team-actorMessageReaction
 */
import { CommandId, MessageId, type OrchestrationThread } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { T3TeamActorMailboxEntry, T3TeamActorMailboxShape } from "./t3team-actorMailbox.ts";
import { buildActorReactionBatchInput } from "./t3team-actorReactionInput.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

export function startActorReaction(input: {
  readonly engine: OrchestrationEngineShape;
  readonly mailbox: T3TeamActorMailboxShape;
  readonly threadId: string;
  readonly loadThread: (threadId: string) => Effect.Effect<OrchestrationThread | undefined>;
  readonly entries: ReadonlyArray<T3TeamActorMailboxEntry>;
}) {
  return Effect.gen(function* () {
    const { engine, mailbox, threadId, entries } = input;
    // Reload rather than trusting the caller's busy-check snapshot: the
    // thread can vanish between claim and dispatch, and a stale "found" would
    // strand the mailbox flag on a phantom reaction.
    const thread = yield* input.loadThread(threadId);
    if (!thread) {
      // Thread vanished between claim and dispatch; release the flag so a
      // later delivery is not stuck behind a phantom reaction.
      yield* mailbox.clearReacting(threadId);
      return;
    }
    const first = entries[0];
    if (first === undefined) {
      // An empty claim is a caller bug; release the flag so nothing strands.
      yield* mailbox.clearReacting(threadId);
      return;
    }
    // Batched `actor` metadata: the first sender addresses the reply, urgency
    // and hop count take the batch's strongest values (conservative for the
    // loop guard), and `messageIds` names the whole batch so a restart
    // rehydrate marks every coalesced delivery as already reacted.
    const actor = {
      senderThreadId: first.fromThreadId,
      urgency: entries.some((entry) => entry.urgency === "urgent")
        ? ("urgent" as const)
        : ("normal" as const),
      hopCount: Math.max(...entries.map((entry) => entry.hopCount)),
      rootThreadId: first.rootThreadId,
      ...(entries.length > 1 ? { messageIds: entries.map((entry) => entry.messageId) } : {}),
    };
    const createdAt = DateTime.formatIso(yield* DateTime.now);
    yield* engine
      .dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make(`server:t3team:actor-react:${t3teamRandomUUID()}`),
        threadId: thread.id,
        message: {
          messageId: MessageId.make(t3teamRandomUUID()),
          role: "user",
          text: buildActorReactionBatchInput(entries),
          attachments: [],
          t3teamExt: {
            visibleToUser: false,
            actor,
          },
        },
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        createdAt,
      })
      .pipe(
        Effect.catch((error) =>
          mailbox.requeueFailed(threadId, entries).pipe(
            Effect.flatMap((willRetry) =>
              Effect.logWarning("actor-message reaction turn failed to start", {
                threadId,
                fromThreadId: first.fromThreadId,
                batchSize: entries.length,
                dispatchAttempts: first.dispatchAttempts + 1,
                willRetry,
                error,
              }),
            ),
          ),
        ),
      );
  });
}
