import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";

import { makeT3TeamActorMailbox, type T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

function entry(overrides: Partial<T3TeamActorMailboxEntry> = {}): T3TeamActorMailboxEntry {
  return {
    messageId: "message-1",
    fromThreadId: "sender",
    fromTitle: "Sender",
    fromProjectId: "project-1",
    text: "hello",
    urgency: "normal",
    hopCount: 0,
    rootThreadId: "sender",
    createdAt: "2026-08-09T00:00:00.000Z",
    dispatchAttempts: 0,
    ...overrides,
  };
}

describe("T3TeamActorMailbox suppression", () => {
  it("a suppressed thread receives (enqueues) an actor message but does not hand it out for dispatch", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const mailbox = yield* makeT3TeamActorMailbox;
        yield* mailbox.suppress("thread-a");
        const enqueued = yield* mailbox.enqueue("thread-a", entry());
        expect(enqueued).toBe(true);
        expect(yield* mailbox.isSuppressed("thread-a")).toBe(true);
        const claimed = yield* mailbox.takeNextForDispatch("thread-a");
        expect(claimed).toBeUndefined();
      }),
    );
  });

  it("clearing suppression lets a message queued while suppressed dispatch", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const mailbox = yield* makeT3TeamActorMailbox;
        yield* mailbox.suppress("thread-a");
        yield* mailbox.enqueue("thread-a", entry());
        expect(yield* mailbox.takeNextForDispatch("thread-a")).toBeUndefined();

        yield* mailbox.clearSuppression("thread-a");
        expect(yield* mailbox.isSuppressed("thread-a")).toBe(false);
        const claimed = yield* mailbox.takeNextForDispatch("thread-a");
        expect(claimed?.messageId).toBe("message-1");
      }),
    );
  });

  it("suppression is per-thread: another thread's mailbox is unaffected", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const mailbox = yield* makeT3TeamActorMailbox;
        yield* mailbox.suppress("thread-a");
        yield* mailbox.enqueue("thread-b", entry({ messageId: "message-2" }));
        const claimed = yield* mailbox.takeNextForDispatch("thread-b");
        expect(claimed?.messageId).toBe("message-2");
      }),
    );
  });

  it("suppression survives clearReacting (a settled turn does not itself lift the stop)", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const mailbox = yield* makeT3TeamActorMailbox;
        yield* mailbox.suppress("thread-a");
        yield* mailbox.clearReacting("thread-a");
        expect(yield* mailbox.isSuppressed("thread-a")).toBe(true);
      }),
    );
  });
});
