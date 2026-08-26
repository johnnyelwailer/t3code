/**
 * Turns one claimed mailbox BATCH of entries into a single `thread.turn.start`
 * reaction turn (framed `actor` input, `visibleToUser: false`) — see
 * t3team-actorMessageReactor.ts, which owns claim/drain and calls this once a
 * thread is confirmed idle and unsuppressed. A one-entry batch is framed
 * exactly like the historical single-message delivery.
 *
 * Also owns the restart-hold summary dispatch (GHE #155,
 * startActorRestartHoldSummary): the ONE turn that surfaces a held thread's
 * pending inter-agent work + interrupted children when the user continues it.
 *
 * @module t3team-actorMessageReaction
 */
import { CommandId, MessageId, type OrchestrationThread } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { T3TeamActorMailboxEntry, T3TeamActorMailboxShape } from "./t3team-actorMailbox.ts";
import {
  appendActorReactionUserReturnInstruction,
  buildActorReactionTurnInput,
  detectUserFacingOpenState,
} from "./t3team-actorReactionVisibility.ts";
import {
  buildActorRestartHoldSummary,
  type InterruptedChildThread,
} from "./t3team-actorRestartHold.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  appendHumanSteeringInstruction,
  humanSteeringInstructionForThread,
} from "./t3team-actorSteeringContext.ts";

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
    const now = yield* DateTime.now;
    const createdAt = DateTime.formatIso(now);
    yield* engine
      .dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make(`server:t3team:actor-react:${t3teamRandomUUID()}`),
        threadId: thread.id,
        message: {
          messageId: MessageId.make(t3teamRandomUUID()),
          role: "user",
          // GHE #156 + #209: user-return + human-steering SUFFIXES; rehydrate prefix-matching kept.
          text: appendHumanSteeringInstruction(
            buildActorReactionTurnInput(entries, detectUserFacingOpenState(thread.messages)),
            humanSteeringInstructionForThread(thread, DateTime.toEpochMillis(now)),
          ),
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

/**
 * Dispatch the ONE restart-hold summary turn (GHE #155): a hidden actor-framed
 * `thread.turn.start` whose input is {@link buildActorRestartHoldSummary} and
 * whose `t3teamExt.actor.messageIds` names every held delivery, so a later
 * restart rehydrate marks the whole batch as already reacted. Mirrors
 * startActorReaction's failure handling (requeue the claimed batch; the
 * ordinary drain picks it up on the next settle).
 */
export function startActorRestartHoldSummary(input: {
  readonly engine: OrchestrationEngineShape;
  readonly mailbox: T3TeamActorMailboxShape;
  readonly threadId: string;
  readonly loadThread: (threadId: string) => Effect.Effect<OrchestrationThread | undefined>;
  readonly entries: ReadonlyArray<T3TeamActorMailboxEntry>;
  readonly interruptedChildren: ReadonlyArray<InterruptedChildThread>;
}): Effect.Effect<void> {
  return Effect.gen(function* () {
    const { engine, mailbox, threadId, entries, interruptedChildren } = input;
    // Reload rather than trusting the caller's settle snapshot: the thread can
    // vanish between settle and dispatch, and a stale "found" would strand the
    // mailbox flag on a phantom reaction.
    const thread = yield* input.loadThread(threadId);
    if (!thread) {
      yield* mailbox.clearReacting(threadId);
      return;
    }
    const first = entries[0];
    const actor = {
      // The summary is server-framed; replies address the first held sender
      // when there is one, else this thread itself.
      senderThreadId: first?.fromThreadId ?? thread.id,
      urgency: entries.some((entry) => entry.urgency === "urgent")
        ? ("urgent" as const)
        : ("normal" as const),
      // Conservative for the loop guard: the strongest hop count held.
      hopCount: entries.length > 0 ? Math.max(...entries.map((entry) => entry.hopCount)) : 0,
      rootThreadId: first?.rootThreadId ?? thread.id,
      // Always present (even for a single entry): the summary input is NOT the
      // single-entry delivery framing, so restart-rehydrate matching must go
      // through the batch path, which keys on messageIds.
      messageIds: entries.map((entry) => entry.messageId),
    };
    yield* engine
      .dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make(`server:t3team:restart-hold-summary:${t3teamRandomUUID()}`),
        threadId: thread.id,
        message: {
          messageId: MessageId.make(t3teamRandomUUID()),
          role: "user",
          // GHE #156 + #209: user-return + human-steering suffixes (batch rehydrate).
          text: appendHumanSteeringInstruction(
            appendActorReactionUserReturnInstruction(
              buildActorRestartHoldSummary({ entries, interruptedChildren }),
              detectUserFacingOpenState(thread.messages),
            ),
            humanSteeringInstructionForThread(thread, DateTime.toEpochMillis(yield* DateTime.now)),
          ),
          attachments: [],
          t3teamExt: {
            visibleToUser: false,
            actor,
          },
        },
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        createdAt: DateTime.formatIso(yield* DateTime.now),
      })
      .pipe(
        Effect.catch((error) =>
          mailbox.requeueFailed(threadId, entries).pipe(
            Effect.flatMap((willRetry) =>
              Effect.logWarning("restart-hold summary turn failed to start", {
                threadId,
                batchSize: entries.length,
                interruptedChildren: interruptedChildren.length,
                willRetry,
                error,
              }),
            ),
          ),
        ),
      );
  });
}
