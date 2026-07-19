import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";

import { makeT3workActorMailbox, type T3workActorMailboxEntry } from "./t3work-actorMailbox.ts";

const entry = (messageId: string): T3workActorMailboxEntry => ({
  messageId,
  fromThreadId: "sender",
  fromTitle: "Sender",
  fromProjectId: "project",
  text: messageId,
  urgency: "normal",
  hopCount: 1,
  rootThreadId: "root",
  createdAt: "2026-07-19T08:00:00.000Z",
  dispatchAttempts: 0,
});

describe("makeT3workActorMailbox", () => {
  it("requeues failed claims at the front and bounds attempts", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mailbox = yield* makeT3workActorMailbox;
        yield* mailbox.enqueue("target", entry("first"));
        yield* mailbox.enqueue("target", entry("second"));
        const first = yield* mailbox.takeNextForDispatch("target");
        const retry1 = first ? yield* mailbox.requeueFailed("target", first) : false;
        const firstRetry = yield* mailbox.takeNextForDispatch("target");
        const retry2 = firstRetry ? yield* mailbox.requeueFailed("target", firstRetry) : false;
        const lastAttempt = yield* mailbox.takeNextForDispatch("target");
        const retry3 = lastAttempt ? yield* mailbox.requeueFailed("target", lastAttempt) : false;
        const next = yield* mailbox.takeNextForDispatch("target");
        return { retry1, retry2, retry3, firstRetry, lastAttempt, next };
      }),
    );

    expect(result.retry1).toBe(true);
    expect(result.retry2).toBe(true);
    expect(result.retry3).toBe(false);
    expect(result.firstRetry?.messageId).toBe("first");
    expect(result.lastAttempt?.dispatchAttempts).toBe(2);
    expect(result.next?.messageId).toBe("second");
  });

  it("deduplicates replayed delivery ids", async () => {
    const claimed = await Effect.runPromise(
      Effect.gen(function* () {
        const mailbox = yield* makeT3workActorMailbox;
        expect(yield* mailbox.enqueue("target", entry("same"))).toBe(true);
        expect(yield* mailbox.enqueue("target", entry("same"))).toBe(false);
        return yield* mailbox.takeNextForDispatch("target");
      }),
    );
    expect(claimed?.messageId).toBe("same");
  });
});
