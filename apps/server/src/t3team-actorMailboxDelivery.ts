/**
 * Inter-agent mailbox DELIVERY: turns a thread's pending mailbox entries into
 * ONE digest run — a single `message.dispatch` (`createdBy: "agent"`,
 * `senderThreadId` = first sender, a `notification` row) — at a boundary:
 * the thread is idle, not held by a user stop, the coalescing window passed
 * (or an entry is urgent) and the user is not typing in its composer.
 *
 * Exactly-once: a batch is first CLAIMED under a deterministic digest id
 * (message and command id), then dispatched, then marked delivered. A crash
 * between dispatch and mark leaves it claimed; the next drain re-dispatches
 * the same id, which V2 command receipts replay instead of running twice. A
 * failed dispatch releases the batch (a fresh id per attempt, since V2 keeps
 * a rejected command id rejected).
 *
 * @module t3team-actorMailboxDelivery
 */
import {
  CommandId,
  MessageId,
  type OrchestrationV2AppThreadLineage,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2ServerCommand,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { T3TeamActorMailboxError, T3TeamActorMailboxStore } from "./t3team-actorMailbox.ts";
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailboxEntry.ts";
import { isMailboxThreadBusy } from "./t3team-actorMessageReactorLimits.ts";
import { buildActorReactionTurnInput } from "./t3team-actorReactionVisibility.ts";
import { humanSteeringInstructionForThread } from "./t3team-actorSteeringContext.ts";

/** Message (and command) id prefix of a digest run's user message. */
export const MAILBOX_DIGEST_PREFIX = "t3team-mailbox-digest:";

const mailboxDigestId = (firstMessageId: string, attempt: number) =>
  `${MAILBOX_DIGEST_PREFIX}${firstMessageId}:${attempt}`;

export interface MailboxThreadState {
  readonly status: string;
  readonly activeRunId: string | null;
  readonly archivedAt: unknown;
  readonly lineage: OrchestrationV2AppThreadLineage;
}

export interface MailboxDeliveryDeps {
  readonly store: T3TeamActorMailboxStore["Service"];
  /** The thread's shell, or null when it is deleted (a failed read FAILS, never reads as null). */
  readonly loadThread: (
    threadId: string,
  ) => Effect.Effect<MailboxThreadState | null, T3TeamActorMailboxError>;
  /** The thread's user/assistant messages (human-steering suffix). */
  readonly loadMessages: (
    threadId: string,
  ) => Effect.Effect<ReadonlyArray<OrchestrationV2ConversationMessage>>;
  readonly dispatch: (command: OrchestrationV2ServerCommand) => Effect.Effect<unknown, string>;
  readonly isEngaged: (threadId: string) => Effect.Effect<boolean>;
  readonly debounceMs: number;
  readonly batchMax: number;
  readonly nowMillis: () => number;
}

export type MailboxDrainOutcome =
  | { readonly state: "dispatched"; readonly entries: ReadonlyArray<T3TeamActorMailboxEntry> }
  | {
      readonly state: "held" | "busy" | "waiting";
      readonly pending: ReadonlyArray<T3TeamActorMailboxEntry>;
    };

/** One-line subject of an entry: the sender's summary, else the start of the body. */
export const mailboxEntrySubject = (entry: Pick<T3TeamActorMailboxEntry, "summary" | "text">) =>
  entry.summary?.trim() || entry.text.replace(/\s+/g, " ").trim().slice(0, 80);

const digestSummary = (entries: ReadonlyArray<T3TeamActorMailboxEntry>) => {
  const senders = [...new Set(entries.map((entry) => `«${entry.fromTitle}»`))];
  const noun = entries.length === 1 ? "message" : "messages";
  return `${entries.length} ${noun} from ${senders.slice(0, 3).join(", ")}${senders.length > 3 ? " …" : ""}`;
};

export const makeMailboxDelivery = (deps: MailboxDeliveryDeps) => {
  const draining = new Set<string>();
  // The standing protocol rides on a thread's first digest since process start.
  const briefed = new Set<string>();

  const dispatchDigest = (
    threadId: string,
    digestId: string,
    entries: ReadonlyArray<T3TeamActorMailboxEntry>,
  ) =>
    Effect.gen(function* () {
      const first = entries[0]!;
      const thread = yield* deps.loadThread(threadId);
      const steering = humanSteeringInstructionForThread({
        messages: yield* deps.loadMessages(threadId),
        parentThreadId: thread?.lineage.parentThreadId ?? null,
        nowMillis: deps.nowMillis(),
      });
      const text = buildActorReactionTurnInput(entries, !briefed.has(threadId), steering);
      const dispatched = yield* deps
        .dispatch({
          type: "message.dispatch",
          commandId: CommandId.make(digestId),
          threadId: ThreadId.make(threadId),
          messageId: MessageId.make(digestId),
          text,
          attachments: [],
          dispatchMode: { type: "queue_after_active" },
          createdBy: "agent",
          creationSource: "server",
          senderThreadId: ThreadId.make(first.fromThreadId),
          notification: {
            source: { kind: "background_task" },
            outcome: "updated",
            summary: digestSummary(entries),
            detail: entries.map((entry) => `- ${mailboxEntrySubject(entry)}`).join("\n"),
          },
        })
        .pipe(Effect.result);
      if (dispatched._tag === "Failure") {
        yield* Effect.logWarning("t3team mailbox digest dispatch failed", {
          threadId,
          digestId,
          cause: dispatched.failure,
        });
        yield* deps.store.release(digestId);
        return false;
      }
      briefed.add(threadId);
      yield* deps.store.markDelivered(
        digestId,
        DateTime.formatIso(DateTime.makeUnsafe(deps.nowMillis())),
      );
      return true;
    });

  const outcome = (value: MailboxDrainOutcome) => value;

  const drainUnguarded = (threadId: string, force: boolean) =>
    Effect.gen(function* () {
      // Recovery first: a claimed batch whose dispatch was cut off (restart).
      for (const digest of yield* deps.store.claimed(threadId)) {
        yield* dispatchDigest(threadId, digest.digestMessageId, digest.entries);
      }
      const pending = yield* deps.store.pending(threadId);
      if (pending.length === 0) return outcome({ state: "dispatched", entries: [] });
      const thread = yield* deps.loadThread(threadId);
      if (thread === null) {
        // Deleted: nothing can deliver these any more; retire them so no sweep rescans them.
        yield* Effect.logWarning("t3team mailbox recipient deleted; messages dropped", {
          threadId,
          dropped: pending.length,
        });
        yield* deps.store.retireRecipient(threadId);
        return outcome({ state: "dispatched", entries: [] });
      }
      // Archived threads keep their messages (the sweep skips them until unarchived).
      if (thread.archivedAt !== null || (yield* deps.store.isHeld(threadId))) {
        return outcome({ state: "held", pending });
      }
      if (isMailboxThreadBusy(thread)) return outcome({ state: "busy", pending });
      if (!force && !pending.some((entry) => entry.urgency === "urgent")) {
        const oldest = Date.parse(pending[0]!.createdAt);
        if (deps.nowMillis() - oldest < deps.debounceMs)
          return outcome({ state: "waiting", pending });
        if (yield* deps.isEngaged(threadId)) return outcome({ state: "waiting", pending });
      }
      const batch = pending.slice(0, deps.batchMax);
      const ids = batch.map((entry) => entry.messageId);
      const digestId = mailboxDigestId(ids[0]!, yield* deps.store.attempts(ids));
      if (!(yield* deps.store.claim({ threadId, messageIds: ids, digestMessageId: digestId }))) {
        return outcome({ state: "busy", pending });
      }
      const delivered = yield* dispatchDigest(threadId, digestId, batch);
      return outcome(
        delivered ? { state: "dispatched", entries: batch } : { state: "busy", pending },
      );
    });

  /** One drain per thread at a time in this process; a concurrent call reports busy. */
  const drain = (threadId: string, options: { readonly force: boolean } = { force: false }) =>
    Effect.suspend(() => {
      if (draining.has(threadId)) {
        return Effect.succeed<MailboxDrainOutcome>({ state: "busy", pending: [] });
      }
      draining.add(threadId);
      return drainUnguarded(threadId, options.force).pipe(
        Effect.ensuring(Effect.sync(() => draining.delete(threadId))),
      );
    });

  return { drain };
};

export type MailboxDelivery = ReturnType<typeof makeMailboxDelivery>;
