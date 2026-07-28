import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeT3TeamActorMailbox, type T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

const entry = (messageId: string): T3TeamActorMailboxEntry => ({
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

describe("makeT3TeamActorMailbox", () => {
  it.effect("requeues failed claims at the front and bounds attempts", () =>
    Effect.gen(function* () {
      const mailbox = yield* makeT3TeamActorMailbox;
      yield* mailbox.enqueue("target", entry("first"));
      yield* mailbox.enqueue("target", entry("second"));
      const first = yield* mailbox.takeNextForDispatch("target");
      const retry1 = first ? yield* mailbox.requeueFailed("target", first) : false;
      const firstRetry = yield* mailbox.takeNextForDispatch("target");
      const retry2 = firstRetry ? yield* mailbox.requeueFailed("target", firstRetry) : false;
      const lastAttempt = yield* mailbox.takeNextForDispatch("target");
      const retry3 = lastAttempt ? yield* mailbox.requeueFailed("target", lastAttempt) : false;
      const next = yield* mailbox.takeNextForDispatch("target");
      const result = { retry1, retry2, retry3, firstRetry, lastAttempt, next };

      expect(result.retry1).toBe(true);
      expect(result.retry2).toBe(true);
      expect(result.retry3).toBe(false);
      expect(result.firstRetry?.messageId).toBe("first");
      expect(result.lastAttempt?.dispatchAttempts).toBe(2);
      expect(result.next?.messageId).toBe("second");
    }),
  );

  it.effect("deduplicates replayed delivery ids", () =>
    Effect.gen(function* () {
      const mailbox = yield* makeT3TeamActorMailbox;
      expect(yield* mailbox.enqueue("target", entry("same"))).toBe(true);
      expect(yield* mailbox.enqueue("target", entry("same"))).toBe(false);
      const claimed = yield* mailbox.takeNextForDispatch("target");
      expect(claimed?.messageId).toBe("same");
    }),
  );
});
