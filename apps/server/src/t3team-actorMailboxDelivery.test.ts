import { assert, it } from "@effect/vitest";
import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "./orchestration-v2/ProjectionStore.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { T3TeamActorMailboxStore, T3TeamActorMailboxStoreLive } from "./t3team-actorMailbox.ts";
import {
  MAILBOX_DIGEST_PREFIX,
  makeMailboxDelivery,
  type MailboxDeliveryDeps,
} from "./t3team-actorMailboxDelivery.ts";
import { makeMailboxSend } from "./t3team-actorMailboxSend.ts";
import { ACTOR_STANDING_INSTRUCTION } from "./t3team-actorReactionInput.ts";
import { T3TeamThreadMessageRecorder } from "./t3team-v2/t3team-threadMessageRecorder.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

const TestLayer = Layer.mergeAll(
  makeT3TeamV2TestLayer("t3team-actor-mailbox"),
  T3TeamActorMailboxStoreLive.pipe(Layer.provide(SqlitePersistenceMemory)),
);

const T0 = Date.parse("2026-10-03T10:00:00.000Z");
const iso = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));

/** Real store, orchestrator and recorder; the clock and engagement are the test's. */
const harness = (clock: { now: number }, overrides: Partial<MailboxDeliveryDeps> = {}) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const store = yield* T3TeamActorMailboxStore;
    const recorder = yield* T3TeamThreadMessageRecorder;
    const delivery = makeMailboxDelivery({
      store,
      loadThread: (threadId) =>
        projections.getThreadShell(ThreadId.make(threadId)).pipe(Effect.orDie),
      loadMessages: (threadId) =>
        projections.getThreadRecords(ThreadId.make(threadId), ["messages"]).pipe(
          Effect.map((records) => records.messages),
          Effect.orDie,
        ),
      dispatch: (command) => orchestrator.dispatch(command).pipe(Effect.mapError(String)),
      isEngaged: () => Effect.succeed(false),
      debounceMs: 60_000,
      batchMax: 10,
      nowMillis: () => clock.now,
      ...overrides,
    });
    const send = makeMailboxSend({
      store,
      loadSender: (threadId) =>
        projections.getThreadRecords(threadId, ["runs"]).pipe(
          Effect.map(({ thread, runs }) => ({ title: thread.title, runs })),
          Effect.orDie,
        ),
      recordMessage: recorder.record,
      nudge: () => Effect.void,
      nowIso: () => iso(clock.now),
    });
    return { delivery, send, store, projections };
  });

const message = (from: string, to: string, id: string, text: string, urgent = false) => ({
  senderThreadId: ThreadId.make(from),
  targetThreadId: ThreadId.make(to),
  messageId: MessageId.make(id),
  text,
  summary: undefined,
  urgent,
});

it.layer(TestLayer)("inter-agent mailbox on V2", (it) => {
  it.effect("coalesces pending messages into ONE digest run once the window passed", () =>
    Effect.gen(function* () {
      const clock = { now: T0 };
      const { delivery, send, store, projections } = yield* harness(clock);
      yield* createTestThread(ThreadId.make("mb:sender"), "Sender");
      yield* createTestThread(ThreadId.make("mb:recipient"), "Recipient");
      assert.deepStrictEqual(yield* send(message("mb:sender", "mb:recipient", "m1", "First")), {
        state: "queued",
      });
      yield* send(message("mb:sender", "mb:recipient", "m2", "Second"));
      // Idempotent: a retried send with the same message id queues nothing new.
      yield* send(message("mb:sender", "mb:recipient", "m2", "Second"));

      clock.now = T0 + 1_000;
      assert.strictEqual((yield* delivery.drain("mb:recipient")).state, "waiting");
      clock.now = T0 + 61_000;
      const drained = yield* delivery.drain("mb:recipient");
      assert.strictEqual(drained.state, "dispatched");

      const { messages, runs } = yield* projections.getThreadRecords(
        ThreadId.make("mb:recipient"),
        ["messages", "runs"],
      );
      const digests = messages.filter((entry) => entry.id.startsWith(MAILBOX_DIGEST_PREFIX));
      assert.strictEqual(digests.length, 1);
      assert.strictEqual(runs.length, 1);
      const digest = digests[0]!;
      assert.strictEqual(digest.createdBy, "agent");
      assert.strictEqual(digest.senderThreadId, "mb:sender");
      assert.strictEqual(digest.notification?.summary, "2 messages from «Sender»");
      assert.include(digest.text, "[Inter-agent digest: 2 message(s)]");
      assert.include(digest.text, "First");
      assert.include(digest.text, ACTOR_STANDING_INSTRUCTION);
      assert.deepStrictEqual(yield* store.pending("mb:recipient"), []);
    }),
  );

  it.effect("urgent skips the window, a user-stop hold pauses delivery, busy waits", () =>
    Effect.gen(function* () {
      const clock = { now: T0 };
      const { delivery, send, store } = yield* harness(clock);
      yield* createTestThread(ThreadId.make("mb:a"), "A");
      yield* createTestThread(ThreadId.make("mb:b"), "B");
      yield* send(message("mb:a", "mb:b", "u1", "Blocked on your decision", true));
      yield* store.hold("mb:b", iso(T0));
      assert.strictEqual((yield* delivery.drain("mb:b")).state, "held");
      yield* store.releaseHolds(["mb:b"]);
      assert.strictEqual((yield* delivery.drain("mb:b")).state, "dispatched");
      // The digest started a run on B: the next message waits for it to end.
      yield* send(message("mb:a", "mb:b", "u2", "Another", true));
      assert.strictEqual((yield* delivery.drain("mb:b", { force: true })).state, "busy");
    }),
  );

  it.effect("replies from a digest run count hops; past the cap they are only surfaced", () =>
    Effect.gen(function* () {
      const clock = { now: T0 };
      const { delivery, send, store, projections } = yield* harness(clock);
      yield* createTestThread(ThreadId.make("mb:root"), "Root");
      yield* createTestThread(ThreadId.make("mb:peer"), "Peer");
      // A chain that is already 6 hops deep reaches the peer.
      yield* store.enqueue({
        messageId: "deep",
        toThreadId: "mb:peer",
        fromThreadId: "mb:root",
        fromTitle: "Root",
        text: "deep chain",
        urgency: "urgent",
        hopCount: 6,
        rootThreadId: "mb:root",
        createdAt: iso(T0),
      });
      assert.strictEqual((yield* delivery.drain("mb:peer")).state, "dispatched");

      const reply = yield* send(message("mb:peer", "mb:root", "reply", "Answer from peer"));
      assert.strictEqual(reply.state, "surfaced");
      assert.deepStrictEqual(yield* store.pending("mb:root"), []);
      const { messages } = yield* projections.getThreadRecords(ThreadId.make("mb:root"), [
        "messages",
      ]);
      const surfaced = messages.find((entry) => entry.id === "reply");
      assert.strictEqual(surfaced?.runId, null);
      assert.strictEqual(surfaced?.senderThreadId, "mb:peer");
    }),
  );

  it.effect("re-dispatches a claimed digest after a crash without running it twice", () =>
    Effect.gen(function* () {
      const clock = { now: T0 + 120_000 };
      const { delivery, send, store, projections } = yield* harness(clock);
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      yield* createTestThread(ThreadId.make("mb:x"), "X");
      yield* createTestThread(ThreadId.make("mb:y"), "Y");
      yield* send(message("mb:x", "mb:y", "c1", "Crash test"));
      const digestId = `${MAILBOX_DIGEST_PREFIX}c1:0`;
      assert.isTrue(
        yield* store.claim({ threadId: "mb:y", messageIds: ["c1"], digestMessageId: digestId }),
      );
      // The process dispatched the digest, then died before marking it delivered.
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(digestId),
        threadId: ThreadId.make("mb:y"),
        messageId: MessageId.make(digestId),
        text: "digest",
        attachments: [],
        dispatchMode: { type: "queue_after_active" },
        createdBy: "agent",
        creationSource: "server",
        notification: {
          source: { kind: "background_task" },
          outcome: "updated",
          summary: "1 message",
        },
      });
      yield* delivery.drain("mb:y");
      assert.deepStrictEqual(yield* store.claimed("mb:y"), []);
      const { runs } = yield* projections.getThreadRecords(ThreadId.make("mb:y"), ["runs"]);
      assert.strictEqual(runs.length, 1);
    }),
  );

  it.effect("a failed dispatch releases the batch and retries under a fresh id", () =>
    Effect.gen(function* () {
      const clock = { now: T0 + 120_000 };
      let failNext = true;
      const base = yield* harness(clock);
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const { delivery } = yield* harness(clock, {
        dispatch: (command) =>
          failNext
            ? Effect.sync(() => (failNext = false)).pipe(Effect.andThen(Effect.fail("boom")))
            : orchestrator.dispatch(command).pipe(Effect.mapError(String)),
      });
      yield* createTestThread(ThreadId.make("mb:p"), "P");
      yield* createTestThread(ThreadId.make("mb:q"), "Q");
      yield* base.send(message("mb:p", "mb:q", "r1", "Retry me", true));
      assert.strictEqual((yield* delivery.drain("mb:q")).state, "busy");
      assert.strictEqual((yield* base.store.pending("mb:q")).length, 1);
      assert.strictEqual((yield* delivery.drain("mb:q")).state, "dispatched");
      const { messages } = yield* base.projections.getThreadRecords(ThreadId.make("mb:q"), [
        "messages",
      ]);
      assert.isDefined(messages.find((entry) => entry.id === `${MAILBOX_DIGEST_PREFIX}r1:1`));
    }),
  );

  it.effect("retires a deleted recipient; an archived one waits outside the sweep", () =>
    Effect.gen(function* () {
      const clock = { now: T0 + 120_000 };
      const { delivery, send, store } = yield* harness(clock);
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const lifecycle = (
        type: "thread.delete" | "thread.archive" | "thread.unarchive",
        id: string,
      ) =>
        orchestrator.dispatch({
          type,
          commandId: CommandId.make(`${type}:${id}`),
          threadId: ThreadId.make(id),
        });
      for (const id of ["mb:from", "mb:gone", "mb:shelved"])
        yield* createTestThread(ThreadId.make(id));
      yield* send(message("mb:from", "mb:gone", "g1", "Never read"));
      yield* send(message("mb:from", "mb:shelved", "s1", "Read after unarchive"));
      yield* store.hold("mb:gone", iso(T0));
      yield* lifecycle("thread.delete", "mb:gone");
      yield* lifecycle("thread.archive", "mb:shelved");

      // The archived recipient leaves the sweep but keeps its message; the deleted one stays in
      // only until a drain retires it, hold included.
      const swept = yield* store.threadsWithWork();
      assert.include(swept, "mb:gone");
      assert.notInclude(swept, "mb:shelved");
      yield* delivery.drain("mb:gone");
      assert.notInclude(yield* store.threadsWithWork(), "mb:gone");
      assert.deepStrictEqual(yield* store.pending("mb:gone"), []);
      assert.isFalse(yield* store.isHeld("mb:gone"));
      assert.lengthOf(yield* store.pending("mb:shelved"), 1);

      yield* lifecycle("thread.unarchive", "mb:shelved");
      assert.include(yield* store.threadsWithWork(), "mb:shelved");
      clock.now += 61_000;
      assert.strictEqual((yield* delivery.drain("mb:shelved")).state, "dispatched");
    }),
  );

  it.effect("drops the holds of deleted threads and lifts only within one lineage tree", () =>
    Effect.gen(function* () {
      const store = yield* T3TeamActorMailboxStore;
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      for (const id of ["mb:tree-a", "mb:tree-b", "mb:deleted"]) {
        yield* createTestThread(ThreadId.make(id));
        yield* store.hold(id, iso(T0));
      }
      yield* orchestrator.dispatch({
        type: "thread.delete",
        commandId: CommandId.make("thread.delete:mb:deleted"),
        threadId: ThreadId.make("mb:deleted"),
      });
      yield* store.pruneHolds();
      assert.isFalse(yield* store.isHeld("mb:deleted"));
      assert.deepStrictEqual(yield* store.heldThreadsInTree("mb:tree-a"), ["mb:tree-a"]);
    }),
  );
});
