/**
 * Turns one claimed mailbox BATCH of entries into a single `thread.turn.start`
 * reaction turn (framed `actor` digest, `visibleToUser: false`) — see
 * t3team-actorMessageReactor.ts, which owns claim/drain and calls this once a
 * thread is confirmed idle, unsuppressed and (in the normal path) not engaged.
 *
 * Digest framing: ONE format (t3team-actorReactionTurnInput) — sender/subject/
 * urgency per message, short bodies inlined, long bodies as subject +
 * t3team_read_message pointer. The standing inter-agent protocol is appended
 * only on the thread's FIRST digest since process start
 * (`includeStandingInstruction`), decided by the caller via the mailbox's
 * isBriefed/markBriefed.
 *
 * `t3teamExt.actor.messageIds` names every delivery in the batch INCLUDING
 * single-entry batches: the restart rehydrate's primary matching is
 * format-independent on that field (B4 invariant — no restart double-reaction).
 *
 * Both dispatchers resolve to `true` when the turn was dispatched and `false`
 * when it failed and the batch was requeued — so the caller marks the
 * thread's briefing only when the agent actually saw the standing instruction.
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
import { buildActorReactionTurnInput } from "./t3team-actorReactionVisibility.ts";
import {
  buildActorRestartHoldSummary,
  type InterruptedChildThread,
} from "./t3team-actorRestartHold.ts";
import { ACTOR_STANDING_INSTRUCTION } from "./t3team-actorReactionInput.ts";
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
  /** Append the standing inter-agent protocol to THIS digest (first digest of the session). */
  readonly includeStandingInstruction: boolean;
  /**
   * Re-note the claimed entries' urgent ids when a failed dispatch requeues
   * them (m1: forgetClaimedUrgent already ran at claim, so without this a
   * requeued urgent delivery loses its immediate-wake and waits the idle
   * window). Only invoked when the entries actually stay pending (willRetry).
   */
  readonly onRequeueUrgent?: (entries: ReadonlyArray<T3TeamActorMailboxEntry>) => void;
}): Effect.Effect<boolean> {
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
      return false;
    }
    const first = entries[0];
    if (first === undefined) {
      // An empty claim is a caller bug; release the flag so nothing strands.
      yield* mailbox.clearReacting(threadId);
      return false;
    }
    // Batched `actor` metadata: the first sender addresses the reply, urgency
    // and hop count take the batch's strongest values (conservative for the
    // loop guard), and `messageIds` names the WHOLE batch — always, including
    // single entries, so the restart rehydrate matches format-independently.
    const actor = {
      senderThreadId: first.fromThreadId,
      urgency: entries.some((entry) => entry.urgency === "urgent")
        ? ("urgent" as const)
        : ("normal" as const),
      hopCount: Math.max(...entries.map((entry) => entry.hopCount)),
      rootThreadId: first.rootThreadId,
      messageIds: entries.map((entry) => entry.messageId),
    };
    const now = yield* DateTime.now;
    const createdAt = DateTime.formatIso(now);
    const dispatched = yield* engine
      .dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make(`server:t3team:actor-react:${t3teamRandomUUID()}`),
        threadId: thread.id,
        message: {
          messageId: MessageId.make(t3teamRandomUUID()),
          role: "user",
          text: appendHumanSteeringInstruction(
            buildActorReactionTurnInput(entries, input.includeStandingInstruction),
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
        Effect.as(true),
        Effect.catch((error) =>
          Effect.gen(function* () {
            const willRetry = yield* mailbox.requeueFailed(threadId, entries);
            if (willRetry) {
              yield* Effect.sync(() => {
                input.onRequeueUrgent?.(entries);
              });
            }
            yield* Effect.logWarning("actor-message reaction turn failed to start", {
              threadId,
              fromThreadId: first.fromThreadId,
              batchSize: entries.length,
              dispatchAttempts: first.dispatchAttempts + 1,
              willRetry,
              error,
            });
            return false;
          }),
        ),
      );
    return dispatched;
  });
}

/**
 * Dispatch the ONE restart-hold summary turn (GHE #155): a hidden actor-framed
 * `thread.turn.start` whose input is {@link buildActorRestartHoldSummary} and
 * whose `t3teamExt.actor.messageIds` names every held delivery. Mirrors
 * startActorReaction's failure handling (requeue the claimed batch; the
 * ordinary drain picks it up on the next settle). As a reaction turn it is
 * subject to the same once-per-session standing instruction.
 */
export function startActorRestartHoldSummary(input: {
  readonly engine: OrchestrationEngineShape;
  readonly mailbox: T3TeamActorMailboxShape;
  readonly threadId: string;
  readonly loadThread: (threadId: string) => Effect.Effect<OrchestrationThread | undefined>;
  readonly entries: ReadonlyArray<T3TeamActorMailboxEntry>;
  readonly interruptedChildren: ReadonlyArray<InterruptedChildThread>;
  /** Append the standing inter-agent protocol to THIS summary (first digest of the session). */
  readonly includeStandingInstruction: boolean;
  /** Requeue + re-note urgent ids when a failed dispatch requeues the held batch. */
  readonly onRequeueUrgent?: (entries: ReadonlyArray<T3TeamActorMailboxEntry>) => void;
}): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const { engine, mailbox, threadId, entries, interruptedChildren } = input;
    const thread = yield* input.loadThread(threadId);
    if (!thread) {
      yield* mailbox.clearReacting(threadId);
      return false;
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
      // Always present (even for a single entry): the summary input is NOT a
      // digest base, so restart-rehydrate matching goes through messageIds.
      messageIds: entries.map((entry) => entry.messageId),
    };
    const dispatched = yield* engine
      .dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make(`server:t3team:restart-hold-summary:${t3teamRandomUUID()}`),
        threadId: thread.id,
        message: {
          messageId: MessageId.make(t3teamRandomUUID()),
          role: "user",
          text: appendHumanSteeringInstruction(
            buildActorRestartHoldSummary({
              entries,
              interruptedChildren,
            }) +
              (input.includeStandingInstruction ? `\n\n${ACTOR_STANDING_INSTRUCTION}` : ""),
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
        Effect.as(true),
        Effect.catch((error) =>
          Effect.gen(function* () {
            const willRetry = yield* mailbox.requeueFailed(threadId, entries);
            if (willRetry) {
              yield* Effect.sync(() => {
                input.onRequeueUrgent?.(entries);
              });
            }
            yield* Effect.logWarning("restart-hold summary turn failed to start", {
              threadId,
              batchSize: entries.length,
              interruptedChildren: interruptedChildren.length,
              willRetry,
              error,
            });
            return false;
          }),
        ),
      );
    return dispatched;
  });
}
