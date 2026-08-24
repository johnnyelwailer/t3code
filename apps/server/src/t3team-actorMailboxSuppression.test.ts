import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { makeT3TeamActorMailbox, type T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";
import { clearSuppressionForThreadTree } from "./t3team-actorMessageSuppression.ts";

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

it.effect(
  "a suppressed thread receives (enqueues) an actor message but does not hand it out for dispatch",
  () =>
    Effect.gen(function* () {
      const mailbox = yield* makeT3TeamActorMailbox;
      yield* mailbox.suppress("thread-a");
      const enqueued = yield* mailbox.enqueue("thread-a", entry());
      assert.strictEqual(enqueued, true);
      assert.strictEqual(yield* mailbox.isSuppressed("thread-a"), true);
      const claimed = yield* mailbox.takeNextForDispatch("thread-a");
      assert.strictEqual(claimed.length, 0);
    }),
);

it.effect("clearing suppression lets a message queued while suppressed dispatch", () =>
  Effect.gen(function* () {
    const mailbox = yield* makeT3TeamActorMailbox;
    yield* mailbox.suppress("thread-a");
    yield* mailbox.enqueue("thread-a", entry());
    assert.strictEqual((yield* mailbox.takeNextForDispatch("thread-a")).length, 0);

    yield* mailbox.clearSuppression("thread-a");
    assert.strictEqual(yield* mailbox.isSuppressed("thread-a"), false);
    const claimed = yield* mailbox.takeNextForDispatch("thread-a");
    assert.strictEqual(claimed[0]?.messageId, "message-1");
  }),
);

it.effect("suppression is per-thread: another thread's mailbox is unaffected", () =>
  Effect.gen(function* () {
    const mailbox = yield* makeT3TeamActorMailbox;
    yield* mailbox.suppress("thread-a");
    yield* mailbox.enqueue("thread-b", entry({ messageId: "message-2" }));
    const claimed = yield* mailbox.takeNextForDispatch("thread-b");
    assert.strictEqual(claimed[0]?.messageId, "message-2");
  }),
);

it.effect("suppression survives clearReacting (a settled turn does not itself lift the stop)", () =>
  Effect.gen(function* () {
    const mailbox = yield* makeT3TeamActorMailbox;
    yield* mailbox.suppress("thread-a");
    yield* mailbox.clearReacting("thread-a");
    assert.strictEqual(yield* mailbox.isSuppressed("thread-a"), true);
  }),
);

const layer = it.layer(SqlitePersistenceMemory);

layer("clearSuppressionForThreadTree", (it) => {
  it.effect("lifts suppression on a cascade-stopped descendant too", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        INSERT INTO projection_thread_activities (activity_id, thread_id, tone, kind, summary, payload_json, created_at)
        VALUES ('activity-1', 'parent', 'info', 't3team.handoff.started', 'Started child session',
          '{"parentThreadId":"parent","childThreadId":"child"}', '2026-08-11T00:00:00.000Z')
      `;

      const mailbox = yield* makeT3TeamActorMailbox;
      // Simulate a cascade stop: both parent and its handoff child are suppressed.
      yield* mailbox.suppress("parent");
      yield* mailbox.suppress("child");
      yield* mailbox.enqueue("child", entry({ messageId: "queued-on-child" }));

      const drainCalls: string[] = [];
      // The user's next message lands on the PARENT thread, not the child.
      yield* clearSuppressionForThreadTree({
        mailbox,
        tryDrain: (threadId) =>
          Effect.sync(() => {
            drainCalls.push(threadId);
          }),
        threadId: "parent",
      });

      assert.strictEqual(yield* mailbox.isSuppressed("parent"), false);
      assert.strictEqual(yield* mailbox.isSuppressed("child"), false);
      assert.deepStrictEqual([...drainCalls].sort(), ["child", "parent"]);
      const claimed = yield* mailbox.takeNextForDispatch("child");
      assert.strictEqual(claimed[0]?.messageId, "queued-on-child");
    }),
  );
});
