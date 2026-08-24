import { assert, it } from "@effect/vitest";
import type { OrchestrationEvent } from "@t3tools/contracts";
import { describe, expect, it as vitestIt } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { makeT3TeamActorMailbox } from "./t3team-actorMailbox.ts";
import { rehydrateActorMailbox } from "./t3team-actorMailboxRehydrate.ts";
import { collectSuppressedThreadsAtRehydrate } from "./t3team-actorMessageSuppression.ts";

function sessionSet(sequence: number, threadId: string, status: string): OrchestrationEvent {
  return {
    sequence,
    type: "thread.session-set",
    payload: {
      threadId,
      session: { status },
      createdAt: "2026-08-11T00:00:00.000Z",
    },
  } as unknown as OrchestrationEvent;
}

function actorMessageDelivered(
  sequence: number,
  threadId: string,
  messageId: string,
): OrchestrationEvent {
  return {
    sequence,
    type: "thread.actor-message-delivered",
    payload: {
      threadId,
      messageId,
      fromThreadId: `sender-${messageId}`,
      fromTitle: `Sender ${messageId}`,
      fromProjectId: "project",
      text: `body ${messageId}`,
      urgency: "normal",
      hopCount: 1,
      rootThreadId: "root",
      createdAt: "2026-08-11T00:00:00.000Z",
    },
  } as unknown as OrchestrationEvent;
}

function interruptRequested(
  sequence: number,
  threadId: string,
  byUser: boolean,
): OrchestrationEvent {
  return {
    sequence,
    type: "thread.turn-interrupt-requested",
    payload: { threadId, byUser, createdAt: "2026-08-11T00:00:00.000Z" },
  } as unknown as OrchestrationEvent;
}

function realUserMessageSent(sequence: number, threadId: string): OrchestrationEvent {
  return {
    sequence,
    type: "thread.message-sent",
    payload: { threadId, role: "user", text: "hi" },
  } as unknown as OrchestrationEvent;
}

function actorReactionMessageSent(sequence: number, threadId: string): OrchestrationEvent {
  return {
    sequence,
    type: "thread.message-sent",
    payload: {
      threadId,
      role: "user",
      text: "reaction",
      t3teamExt: {
        actor: { senderThreadId: "other", urgency: "normal", hopCount: 1, rootThreadId: "other" },
      },
    },
  } as unknown as OrchestrationEvent;
}

describe("collectSuppressedThreadsAtRehydrate", () => {
  vitestIt(
    "suppresses a thread whose most recent byUser stop is newer than its last real user message",
    () => {
      const events = [interruptRequested(1, "thread-a", true)];
      expect(collectSuppressedThreadsAtRehydrate(events)).toEqual(new Set(["thread-a"]));
    },
  );

  vitestIt("does not suppress a thread whose user message came after the stop", () => {
    const events = [interruptRequested(1, "thread-a", true), realUserMessageSent(2, "thread-a")];
    expect(collectSuppressedThreadsAtRehydrate(events)).toEqual(new Set());
  });

  vitestIt("re-suppresses if a later stop follows the user's re-engagement", () => {
    const events = [
      interruptRequested(1, "thread-a", true),
      realUserMessageSent(2, "thread-a"),
      interruptRequested(3, "thread-a", true),
    ];
    expect(collectSuppressedThreadsAtRehydrate(events)).toEqual(new Set(["thread-a"]));
  });

  vitestIt("ignores a system-raised (non-byUser) stop", () => {
    const events = [interruptRequested(1, "thread-a", false)];
    expect(collectSuppressedThreadsAtRehydrate(events)).toEqual(new Set());
  });

  vitestIt("an actor-reaction message wearing the user role does not lift suppression", () => {
    const events = [
      interruptRequested(1, "thread-a", true),
      actorReactionMessageSent(2, "thread-a"),
    ];
    expect(collectSuppressedThreadsAtRehydrate(events)).toEqual(new Set(["thread-a"]));
  });

  vitestIt("tracks threads independently", () => {
    const events = [
      interruptRequested(1, "thread-a", true),
      interruptRequested(2, "thread-b", true),
      realUserMessageSent(3, "thread-b"),
    ];
    expect(collectSuppressedThreadsAtRehydrate(events)).toEqual(new Set(["thread-a"]));
  });
});

it.effect(
  "rehydrateActorMailbox restores suppression from the event log so a restart does not resume the ping-pong",
  () =>
    Effect.gen(function* () {
      const events: ReadonlyArray<OrchestrationEvent> = [interruptRequested(1, "thread-a", true)];
      const mailbox = yield* makeT3TeamActorMailbox;
      yield* rehydrateActorMailbox({
        engine: { readEvents: () => Stream.fromIterable(events) },
        mailbox,
        hopCap: 6,
      });

      assert.strictEqual(yield* mailbox.isSuppressed("thread-a"), true);
      // A queued actor message must not auto-dispatch on the restored thread.
      yield* mailbox.enqueue("thread-a", {
        messageId: "m1",
        fromThreadId: "sender",
        fromTitle: "Sender",
        fromProjectId: "project",
        text: "hello",
        urgency: "normal",
        hopCount: 0,
        rootThreadId: "sender",
        createdAt: "2026-08-11T00:00:00.000Z",
        dispatchAttempts: 0,
      });
      assert.strictEqual((yield* mailbox.takeNextForDispatch("thread-a")).length, 0);
    }),
);

it.effect("rehydrateActorMailbox does not restore suppression once the user has re-engaged", () =>
  Effect.gen(function* () {
    const events: ReadonlyArray<OrchestrationEvent> = [
      interruptRequested(1, "thread-a", true),
      realUserMessageSent(2, "thread-a"),
    ];
    const mailbox = yield* makeT3TeamActorMailbox;
    yield* rehydrateActorMailbox({
      engine: { readEvents: () => Stream.fromIterable(events) },
      mailbox,
      hopCap: 6,
    });
    assert.strictEqual(yield* mailbox.isSuppressed("thread-a"), false);
  }),
);

it.effect(
  "rehydrateActorMailbox HOLDS pending deliveries: no auto-drain, threads suppressed, entries queued (GHE #155)",
  () =>
    Effect.gen(function* () {
      // N pending inter-agent messages + a stale (running-at-crash) session:
      // the restart must produce ZERO auto reaction turns.
      const events: ReadonlyArray<OrchestrationEvent> = [
        sessionSet(1, "thread-a", "running"),
        actorMessageDelivered(2, "thread-a", "m1"),
        actorMessageDelivered(3, "thread-a", "m2"),
        actorMessageDelivered(4, "thread-b", "m3"),
      ];
      const mailbox = yield* makeT3TeamActorMailbox;
      yield* rehydrateActorMailbox({
        engine: { readEvents: () => Stream.fromIterable(events) },
        mailbox,
        hopCap: 6,
      });

      // Every thread with held work starts suppressed — no auto-dispatch.
      assert.strictEqual(yield* mailbox.isSuppressed("thread-a"), true);
      assert.strictEqual(yield* mailbox.isSuppressed("thread-b"), true);
      // The ordinary drain claim is refused while held…
      assert.strictEqual((yield* mailbox.takeNextForDispatch("thread-a")).length, 0);
      assert.strictEqual((yield* mailbox.takeNextForDispatch("thread-b")).length, 0);
      // …but the work is still queued and consumable on continue: lifting the
      // hold (what the reactor's continue path does) claims every held entry.
      yield* mailbox.clearSuppression("thread-a");
      assert.strictEqual((yield* mailbox.takeNextForDispatch("thread-a")).length, 2);
      yield* mailbox.clearSuppression("thread-b");
      assert.strictEqual((yield* mailbox.takeNextForDispatch("thread-b")).length, 1);
    }),
);

it.effect(
  "rehydrateActorMailbox holds a stale-session thread even without pending deliveries (GHE #155)",
  () =>
    Effect.gen(function* () {
      // A thread still running when the process died: the startup reconcile
      // stops it and its #157 abnormal-stop notifications arrive live AFTER
      // rehydrate — it must start suppressed so they are held, not drained.
      const events: ReadonlyArray<OrchestrationEvent> = [sessionSet(1, "thread-a", "running")];
      const mailbox = yield* makeT3TeamActorMailbox;
      yield* rehydrateActorMailbox({
        engine: { readEvents: () => Stream.fromIterable(events) },
        mailbox,
        hopCap: 6,
      });
      assert.strictEqual(yield* mailbox.isSuppressed("thread-a"), true);
      assert.strictEqual((yield* mailbox.takeNextForDispatch("thread-a")).length, 0);
    }),
);

it.effect(
  "rehydrateActorMailbox does not hold a thread whose session settled before the crash (GHE #155)",
  () =>
    Effect.gen(function* () {
      const events: ReadonlyArray<OrchestrationEvent> = [
        sessionSet(1, "thread-a", "running"),
        sessionSet(2, "thread-a", "idle"),
      ];
      const mailbox = yield* makeT3TeamActorMailbox;
      yield* rehydrateActorMailbox({
        engine: { readEvents: () => Stream.fromIterable(events) },
        mailbox,
        hopCap: 6,
      });
      assert.strictEqual(yield* mailbox.isSuppressed("thread-a"), false);
    }),
);
