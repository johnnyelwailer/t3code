/**
 * Turns one claimed mailbox entry into the `thread.turn.start` reaction turn
 * (framed `actor` input, `visibleToUser: false`) — see
 * t3team-actorMessageReactor.ts, which owns claim/drain and calls this once a
 * thread is confirmed idle and unsuppressed.
 *
 * @module t3team-actorMessageReaction
 */
import { CommandId, MessageId, type OrchestrationThread } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { T3TeamActorMailboxEntry, T3TeamActorMailboxShape } from "./t3team-actorMailbox.ts";
import { buildActorReactionInput } from "./t3team-actorReactionInput.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

export function startActorReaction(input: {
  readonly engine: OrchestrationEngineShape;
  readonly mailbox: T3TeamActorMailboxShape;
  readonly threadId: string;
  readonly loadThread: (threadId: string) => Effect.Effect<OrchestrationThread | undefined>;
  readonly entry: T3TeamActorMailboxEntry;
}) {
  return Effect.gen(function* () {
    const { engine, mailbox, threadId, entry } = input;
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
    const createdAt = DateTime.formatIso(yield* DateTime.now);
    yield* engine
      .dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make(`server:t3team:actor-react:${t3teamRandomUUID()}`),
        threadId: thread.id,
        message: {
          messageId: MessageId.make(t3teamRandomUUID()),
          role: "user",
          text: buildActorReactionInput(entry),
          attachments: [],
          t3teamExt: {
            visibleToUser: false,
            actor: {
              senderThreadId: entry.fromThreadId,
              urgency: entry.urgency,
              hopCount: entry.hopCount,
              rootThreadId: entry.rootThreadId,
            },
          },
        },
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        createdAt,
      })
      .pipe(
        Effect.catch((error) =>
          mailbox.requeueFailed(threadId, entry).pipe(
            Effect.flatMap((willRetry) =>
              Effect.logWarning("actor-message reaction turn failed to start", {
                threadId,
                fromThreadId: entry.fromThreadId,
                dispatchAttempts: entry.dispatchAttempts + 1,
                willRetry,
                error,
              }),
            ),
          ),
        ),
      );
  });
}
