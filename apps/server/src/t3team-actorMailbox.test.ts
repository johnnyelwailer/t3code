import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeT3TeamActorMailbox, type T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

const entry = (messageId: string, overrides: Partial<T3TeamActorMailboxEntry> = {}): T3TeamActorMailboxEntry => ({
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
  ...overrides,
});

describe("makeT3TeamActorMailbox", () => {
  it.effect("claims the whole pending batch in one go, in arrival order", () =>
    Effect.gen(function* () {
      const mailbox = yield* makeT3TeamActorMailbox;
      yield* mailbox.enqueue("target", entry("first"));
      yield* mailbox.enqueue("target", entry("second"));
      yield* mailbox.enqueue("target", entry("third"));

      const batch = yield* mailbox.takeNextForDispatch("target");
      expect(batch.map(({ messageId }) => messageId)).toEqual(["first", "second", "third"]);
      // The reacting flag holds: a concurrent drain claims nothing.
      expect(yield* mailbox.takeNextForDispatch("target")).toEqual([]);

      yield* mailbox.clearReacting("target");
      expect(yield* mailbox.takeNextForDispatch("target")).toEqual([]);
    }),
  );

  it.effect("honors a batch cap, leaving the rest queued for the next drain", () =>
    Effect.gen(function* () {
      const mailbox = yield* makeT3TeamActorMailbox;
      for (const id of ["a", "b", "c", "d"]) yield* mailbox.enqueue("target", entry(id));

      const batch = yield* mailbox.takeNextForDispatch("target", 2);
      expect(batch.map(({ messageId }) => messageId)).toEqual(["a", "b"]);

      yield* mailbox.clearReacting("target");
      const rest = yield* mailbox.takeNextForDispatch("target", 2);
      expect(rest.map(({ messageId }) => messageId)).toEqual(["c", "d"]);
    }),
  );

  it.effect("requeues a failed batch at the front, in order, and bounds attempts", () =>
    Effect.gen(function* () {
      const mailbox = yield* makeT3TeamActorMailbox;
      yield* mailbox.enqueue("target", entry("first"));
      yield* mailbox.enqueue("target", entry("second"));
      const first = yield* mailbox.takeNextForDispatch("target");
      const retry1 = first.length > 0 ? yield* mailbox.requeueFailed("target", first) : false;

      const second = yield* mailbox.takeNextForDispatch("target");
      const retry2 = second.length > 0 ? yield* mailbox.requeueFailed("target", second) : false;

      const third = yield* mailbox.takeNextForDispatch("target");
      const retry3 = third.length > 0 ? yield* mailbox.requeueFailed("target", third) : false;

      const fourth = yield* mailbox.takeNextForDispatch("target");
      const result = { retry1, retry2, retry3, second, third, fourth };

      expect(result.retry1).toBe(true);
      expect(result.retry2).toBe(true);
      // Both entries are now at 2 attempts; one more requeue exhausts them and
      // drops them (same give-up semantics as the historical single-entry cap).
      expect(result.retry3).toBe(false);
      expect(result.second.map(({ messageId }) => messageId)).toEqual(["first", "second"]);
      expect(result.second.map(({ dispatchAttempts }) => dispatchAttempts)).toEqual([1, 1]);
      expect(result.third.map(({ dispatchAttempts }) => dispatchAttempts)).toEqual([2, 2]);
      // After the exhausting requeue the batch is dropped: nothing left.
      expect(result.fourth).toEqual([]);
      expect(yield* mailbox.takeNextForDispatch("target")).toEqual([]);
    }),
  );

  it.effect("deduplicates replayed delivery ids", () =>
    Effect.gen(function* () {
      const mailbox = yield* makeT3TeamActorMailbox;
      expect(yield* mailbox.enqueue("target", entry("same"))).toBe(true);
      expect(yield* mailbox.enqueue("target", entry("same"))).toBe(false);
      const claimed = yield* mailbox.takeNextForDispatch("target");
      expect(claimed.map(({ messageId }) => messageId)).toEqual(["same"]);
    }),
  );
});
