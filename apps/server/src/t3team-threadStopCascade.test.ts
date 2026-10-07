import { assert, describe, it } from "@effect/vitest";
import {
  CommandId,
  MessageId,
  type OrchestrationV2PendingBackgroundTask,
  type OrchestrationV2ThreadShell,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import * as ThreadManagementService from "./orchestration-v2/ThreadManagementService.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { T3TeamActorMailboxStore, T3TeamActorMailboxStoreLive } from "./t3team-actorMailbox.ts";
import { T3TeamActorMailbox } from "./t3team-actorMailboxService.ts";
import { isUserStopCommandId } from "./t3team-actorMessageReactor.ts";
import {
  cascadeStopCommandId,
  collectSubagentDescendants,
  stopThreadCascade,
  stoppableRunId,
} from "./t3team-threadStopCascade.ts";
import { T3TeamThreadLineage } from "./t3team-v2/t3team-threadLineage.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

const node = (
  id: string,
  parent: string | null,
  relationshipToParent: "subagent" | "fork" | null = parent === null ? null : "subagent",
  creationSource: OrchestrationV2ThreadShell["creationSource"] = "mcp",
): Pick<OrchestrationV2ThreadShell, "id" | "lineage" | "creationSource"> => ({
  id: ThreadId.make(id),
  creationSource,
  lineage: {
    parentThreadId: parent === null ? null : ThreadId.make(parent),
    relationshipToParent,
    rootThreadId: ThreadId.make("root"),
  },
});

describe("collectSubagentDescendants", () => {
  it("walks app-owned subagent lineage breadth-first, skipping forks, native subagents and cycles", () => {
    const shells = [
      node("root", null),
      node("a", "root"),
      node("b", "root"),
      node("a1", "a"),
      node("fork-of-root", "root", "fork"),
      node("fork-child", "fork-of-root"),
      // A provider-native subagent runs inside its parent's turn and stops with it.
      node("native", "a", "subagent", "provider"),
      node("elsewhere", null),
    ];
    assert.deepStrictEqual(collectSubagentDescendants("root", shells).map(String), [
      "a",
      "b",
      "a1",
    ]);
    assert.deepStrictEqual(collectSubagentDescendants("elsewhere", shells).map(String), []);
    // Corrupt lineage with a cycle must not hang the walk.
    const cycle = [node("x", "y"), node("y", "x")];
    assert.deepStrictEqual(collectSubagentDescendants("x", cycle).map(String), ["y"]);
  });

  it("stops the active run, else the latest run while only background work remains", () => {
    const [active, latest] = [RunId.make("run:active"), RunId.make("run:latest")];
    const task = { taskId: "bg" } as unknown as OrchestrationV2PendingBackgroundTask;
    const shell = { activeRunId: null, latestRunId: latest, pendingBackgroundTasks: [] };
    assert.strictEqual(stoppableRunId({ ...shell, activeRunId: active }), active);
    assert.strictEqual(stoppableRunId({ ...shell, pendingBackgroundTasks: [task] }), latest);
    assert.isNull(stoppableRunId(shell));
  });

  it("derives per-thread command ids the mailbox and workflow engine read as user stops", () => {
    const id = cascadeStopCommandId("8a6f3c1e-2b4d-4c7a-9e1f-0a1b2c3d4e5f", "thread:child");
    assert.strictEqual(id, "t3team-cascade-stop:8a6f3c1e-2b4d-4c7a-9e1f-0a1b2c3d4e5f:thread:child");
    assert.isTrue(isUserStopCommandId(id));
  });
});

const TestLayer = Layer.mergeAll(
  ThreadManagementService.layer.pipe(
    Layer.provideMerge(makeT3TeamV2TestLayer("t3team-thread-stop-cascade")),
  ),
  T3TeamActorMailboxStoreLive.pipe(Layer.provide(SqlitePersistenceMemory)),
);

const sendUserMessage = (
  threadId: ThreadId,
  id: string,
  dispatchMode: { readonly type: "defer_start" } | { readonly type: "queue_after_active" },
) =>
  Effect.flatMap(Orchestrator.OrchestratorV2, (orchestrator) =>
    orchestrator.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`dispatch:${id}`),
      threadId,
      messageId: MessageId.make(`message:${id}`),
      text: "work",
      attachments: [],
      dispatchMode,
      createdBy: "user",
      creationSource: "web",
    }),
  );

const startDeferredRun = (threadId: ThreadId) =>
  sendUserMessage(threadId, threadId, { type: "defer_start" });

/** The real mailbox store; delivery is not part of a stop. */
const mailboxOf = (store: T3TeamActorMailboxStore["Service"]) =>
  T3TeamActorMailbox.of({
    store,
    send: () => Effect.die("unused"),
    drain: () => Effect.die("unused"),
  });

it.layer(TestLayer)("stopThreadCascade", (it) => {
  it.effect("interrupts the root and every live descendant, idempotently per request", () =>
    Effect.gen(function* () {
      const lineage = yield* T3TeamThreadLineage;
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const [root, child, grandchild, idle] = ["root", "child", "grandchild", "idle"].map((name) =>
        ThreadId.make(`thread:cascade:${name}`),
      ) as [ThreadId, ThreadId, ThreadId, ThreadId];
      for (const threadId of [root, child, grandchild, idle]) yield* createTestThread(threadId);
      const link = (threadId: ThreadId, parentThreadId: ThreadId) =>
        lineage.setThreadLineage({ threadId, parentThreadId, relationshipToParent: "subagent" });
      yield* link(child, root);
      yield* link(grandchild, child);
      yield* link(idle, root);
      yield* startDeferredRun(child);
      yield* startDeferredRun(grandchild);

      const request = { threadId: root, commandId: CommandId.make("request-1") };
      const result = yield* stopThreadCascade(request);
      assert.deepStrictEqual(result, {
        root: "no_active_run",
        descendants: { found: 3, interrupted: 2, failed: 0 },
      });
      for (const threadId of [child, grandchild]) {
        const records = yield* orchestrator.getThreadRecords(threadId, ["turnItems"]);
        const stops = records.turnItems.filter((item) => item.type === "run_interrupt_request");
        assert.strictEqual(stops.length, 1, threadId);
      }

      // The same request again dispatches nothing new (receipts dedupe on the derived ids).
      yield* stopThreadCascade(request);
      const again = yield* orchestrator.getThreadRecords(child, ["turnItems"]);
      assert.strictEqual(
        again.turnItems.filter((item) => item.type === "run_interrupt_request").length,
        1,
      );
    }),
  );

  it.effect("holds queued runs like Stop and holds mailbox delivery into idle descendants", () =>
    Effect.gen(function* () {
      const lineage = yield* T3TeamThreadLineage;
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const store = yield* T3TeamActorMailboxStore;
      const [root, idle] = ["root", "idle"].map((name) => ThreadId.make(`thread:hold:${name}`)) as [
        ThreadId,
        ThreadId,
      ];
      for (const threadId of [root, idle]) yield* createTestThread(threadId);
      yield* lineage.setThreadLineage({
        threadId: idle,
        parentThreadId: root,
        relationshipToParent: "subagent",
      });
      yield* startDeferredRun(root);
      // The user queued a follow-up behind the active run.
      yield* sendUserMessage(root, "hold:follow-up", { type: "queue_after_active" });

      const result = yield* stopThreadCascade(
        { threadId: root, commandId: CommandId.make("request-hold") },
        mailboxOf(store),
      );
      assert.deepStrictEqual(result, {
        root: "interrupt_requested",
        descendants: { found: 1, interrupted: 0, failed: 0 },
      });
      const { runs } = yield* orchestrator.getThreadRecords(root, ["runs"]);
      const queued = runs.filter((run) => run.status === "queued");
      assert.strictEqual(queued.length, 1);
      assert.isTrue(queued[0]!.queueHeld === true);
      // An idle child gets no interrupt, but a digest must not restart it either.
      assert.sameMembers([...(yield* store.heldThreads())], [root, idle]);
    }),
  );
});
