import { assert, it } from "@effect/vitest";
import type { OrchestrationEvent } from "@t3tools/contracts";
import { describe, expect, it as vitestIt } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { makeT3TeamActorMailbox } from "./t3team-actorMailbox.ts";
import { rehydrateActorMailbox } from "./t3team-actorMailboxRehydrate.ts";
import { collectSuppressedThreadsAtRehydrate } from "./t3team-actorMessageSuppression.ts";

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
        tryDrain: () => Effect.void,
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
      assert.isUndefined(yield* mailbox.takeNextForDispatch("thread-a"));
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
      tryDrain: () => Effect.void,
    });
    assert.strictEqual(yield* mailbox.isSuppressed("thread-a"), false);
  }),
);
