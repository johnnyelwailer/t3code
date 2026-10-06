/**
 * The V2 silence watch core over the real fork store (in-memory SQLite) with a
 * fake target projection and a recording mailbox; time is the test clock.
 */
import { assert, it } from "@effect/vitest";
import { NodeId, type OrchestrationV2DomainEvent, RunId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import type { ThreadMailboxSendInput } from "./mcp/t3team-threadMailboxDelivery.ts";
import { SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import {
  makeThreadSilenceWatchCore,
  type SilenceWatchShell,
} from "./t3team-threadSilenceWatchReactor.ts";
import {
  T3TeamThreadSilenceWatchStore,
  T3TeamThreadSilenceWatchStoreLive,
} from "./t3team-threadSilenceWatchStore.ts";

const WATCHER = ThreadId.make("watcher");
const TARGET = ThreadId.make("target");
const MINUTE = 60_000;

const shell = (over: Partial<SilenceWatchShell> = {}): SilenceWatchShell => ({
  status: "running",
  latestRunId: RunId.make("run-1"),
  activityRunStatus: "running",
  pendingBackgroundTasks: [],
  settledAt: null,
  updatedAt: DateTime.makeUnsafe(0),
  lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: TARGET },
  forkedFrom: null,
  ...over,
});

/** The watcher's own `delegate_task` child: upstream wakes the watcher when its run ends. */
const delegatedChildOfWatcher = {
  lineage: { parentThreadId: WATCHER, relationshipToParent: "subagent", rootThreadId: WATCHER },
  forkedFrom: { type: "node", nodeId: NodeId.make("node-1") },
} as const satisfies Partial<SilenceWatchShell>;

const event = (type: string, threadId: string, payload: unknown, atMs: number) =>
  ({
    type,
    threadId: ThreadId.make(threadId),
    occurredAt: DateTime.makeUnsafe(atMs),
    payload,
  }) as unknown as OrchestrationV2DomainEvent;

const setup = Effect.gen(function* () {
  const store = yield* T3TeamThreadSilenceWatchStore;
  const shells = new Map<string, SilenceWatchShell>([
    [WATCHER, shell({ activityRunStatus: null, status: "completed" })],
    [TARGET, shell()],
  ]);
  const tools = new Map<string, ReadonlyArray<string>>();
  const sent: ThreadMailboxSendInput[] = [];
  let nextId = 0;
  const makeCore = () =>
    makeThreadSilenceWatchCore({
      store,
      loadShell: (threadId) => Effect.succeed(shells.get(threadId) ?? null),
      loadActiveToolItemIds: (threadId) => Effect.succeed(tools.get(threadId) ?? []),
      send: (input) => Effect.sync(() => sent.push(input)),
      newWatchId: () => `w${++nextId}`,
    });
  const core = yield* makeCore();
  const watchTarget = (timeoutMs = 15 * MINUTE) =>
    core.register({
      watcherThreadId: WATCHER,
      targetThreadId: TARGET,
      targetTitle: "QA",
      timeoutMs,
    });
  return { store, shells, tools, sent, core, makeCore, watchTarget };
});

const TestLayer = T3TeamThreadSilenceWatchStoreLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const run = <A, E>(effect: Effect.Effect<A, E, T3TeamThreadSilenceWatchStore>) =>
  effect.pipe(Effect.provide(TestLayer));

it.effect("notifies a silent target once per timeout multiple, numbering the notices", () =>
  run(
    Effect.gen(function* () {
      const { core, sent, watchTarget } = yield* setup;
      assert.deepStrictEqual(yield* watchTarget(), { watchId: "w1", timeoutMs: 15 * MINUTE });
      yield* core.sweep;
      assert.lengthOf(sent, 0);
      yield* TestClock.adjust("15 minutes");
      yield* core.sweep;
      yield* core.sweep;
      assert.lengthOf(sent, 1);
      assert.strictEqual(sent[0]?.messageId, "t3team-silence:w1:silent:1");
      assert.strictEqual(sent[0]?.senderThreadId, TARGET);
      assert.strictEqual(sent[0]?.targetThreadId, WATCHER);
      assert.include(sent[0]?.text, "may be wedged");
      yield* TestClock.adjust("15 minutes");
      yield* core.sweep;
      assert.strictEqual(sent[1]?.messageId, "t3team-silence:w1:silent:2");
    }),
  ),
);

it.effect("activity resets the silence clock and open tool items are reported", () =>
  run(
    Effect.gen(function* () {
      const { core, sent, tools, watchTarget } = yield* setup;
      tools.set(TARGET, ["seeded-tool"]);
      yield* watchTarget();
      yield* TestClock.adjust("10 minutes");
      yield* core.handleEvent(event("message.updated", TARGET, {}, 10 * MINUTE));
      yield* TestClock.adjust("10 minutes");
      yield* core.sweep;
      assert.lengthOf(sent, 0);
      yield* core.handleEvent(
        event(
          "turn-item.updated",
          TARGET,
          { id: "seeded-tool", type: "command_execution", status: "running" },
          20 * MINUTE,
        ),
      );
      yield* TestClock.adjust("15 minutes");
      yield* core.sweep;
      assert.include(sent[0]?.text, "A tool call was still in progress (1 open)");
    }),
  ),
);

it.effect("a failed run reports the stop once and closes the watch", () =>
  run(
    Effect.gen(function* () {
      const { core, sent, shells, store, watchTarget } = yield* setup;
      yield* watchTarget();
      shells.set(TARGET, shell({ status: "failed", activityRunStatus: null }));
      yield* core.handleEvent(event("run.updated", TARGET, { status: "failed" }, 1_000));
      assert.lengthOf(sent, 1);
      assert.strictEqual(sent[0]?.messageId, "t3team-silence:watcher:target:stopped:run:run-1");
      assert.include(sent[0]?.text, "terminal state (failed)");
      assert.lengthOf(yield* store.listOpen, 0);
      // Re-watching the same stopped episode reuses the notice id (the mailbox drops it).
      yield* watchTarget();
      assert.strictEqual(sent[1]?.messageId, sent[0]?.messageId);
      assert.lengthOf(yield* store.listOpen, 0);
    }),
  ),
);

it.effect("a watched delegated child's failed run is left to upstream's completion wake", () =>
  run(
    Effect.gen(function* () {
      const { core, sent, shells, store, watchTarget } = yield* setup;
      shells.set(TARGET, shell(delegatedChildOfWatcher));
      yield* watchTarget();
      shells.set(
        TARGET,
        shell({ ...delegatedChildOfWatcher, status: "failed", activityRunStatus: null }),
      );
      yield* core.handleEvent(event("run.updated", TARGET, { status: "failed" }, 1_000));
      // One report per terminal: the parent's completion wake, not a second mailbox digest.
      assert.lengthOf(sent, 0);
      assert.lengthOf(yield* store.listOpen, 0);
      // Deleting the child is not a run terminal, so the watch still reports that.
      shells.set(TARGET, shell(delegatedChildOfWatcher));
      yield* watchTarget();
      shells.delete(TARGET);
      yield* core.handleEvent(event("thread.deleted", TARGET, {}, 2_000));
      assert.include(sent[0]?.text, "terminal state (deleted)");
    }),
  ),
);

it.effect("a normally finished turn closes silently unless background work keeps it busy", () =>
  run(
    Effect.gen(function* () {
      const { core, sent, shells, store, watchTarget } = yield* setup;
      yield* watchTarget();
      const task = { taskId: "t1", kind: "subagent" } as never;
      shells.set(
        TARGET,
        shell({ status: "completed", activityRunStatus: null, pendingBackgroundTasks: [task] }),
      );
      yield* core.handleEvent(event("run.updated", TARGET, { status: "completed" }, 1_000));
      assert.lengthOf(yield* store.listOpen, 1);
      shells.set(TARGET, shell({ status: "completed", activityRunStatus: null }));
      yield* core.sweep;
      assert.lengthOf(yield* store.listOpen, 0);
      assert.lengthOf(sent, 0);
    }),
  ),
);

it.effect("a deleted target is reported; a deleted watcher's watches are dropped silently", () =>
  run(
    Effect.gen(function* () {
      const { core, sent, shells, store, watchTarget } = yield* setup;
      yield* watchTarget();
      shells.delete(TARGET);
      yield* core.handleEvent(event("thread.deleted", TARGET, {}, 1_000));
      assert.include(sent[0]?.text, "terminal state (deleted)");
      shells.set(TARGET, shell());
      yield* watchTarget();
      shells.delete(WATCHER);
      yield* core.handleEvent(event("thread.deleted", WATCHER, {}, 2_000));
      assert.lengthOf(yield* store.listOpen, 0);
      assert.lengthOf(sent, 1);
    }),
  ),
);

it.effect("a restarted core rehydrates from the store and keeps the notice numbering", () =>
  run(
    Effect.gen(function* () {
      const { core, makeCore, sent, watchTarget } = yield* setup;
      yield* watchTarget();
      yield* TestClock.adjust("15 minutes");
      yield* core.sweep;
      const restarted = yield* makeCore();
      yield* restarted.sweep;
      assert.lengthOf(sent, 1);
      yield* TestClock.adjust("15 minutes");
      yield* restarted.sweep;
      assert.strictEqual(sent[1]?.messageId, "t3team-silence:w1:silent:2");
    }),
  ),
);

it.effect("re-arming keeps the watch id and re-reports a still-silent target; cancel closes", () =>
  run(
    Effect.gen(function* () {
      const { core, sent, store, watchTarget } = yield* setup;
      yield* watchTarget();
      yield* TestClock.adjust("15 minutes");
      yield* core.sweep;
      assert.deepStrictEqual(yield* watchTarget(20 * MINUTE), {
        watchId: "w1",
        timeoutMs: 20 * MINUTE,
      });
      yield* TestClock.adjust("5 minutes");
      yield* core.sweep;
      assert.strictEqual(sent[1]?.messageId, "t3team-silence:w1:silent:2");
      assert.deepStrictEqual(
        yield* core.cancel({ watcherThreadId: WATCHER, targetThreadId: TARGET }),
        {
          cancelled: 1,
        },
      );
      assert.lengthOf(yield* store.listOpen, 0);
      const self = yield* core
        .register({
          watcherThreadId: WATCHER,
          targetThreadId: WATCHER,
          targetTitle: "me",
          timeoutMs: undefined,
        })
        .pipe(Effect.flip);
      assert.strictEqual(self, "A thread cannot watch itself.");
    }),
  ),
);
