import { assert, describe, it } from "@effect/vitest";
import {
  CommandId,
  MessageId,
  type OrchestrationV2ThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import * as ThreadManagementService from "./orchestration-v2/ThreadManagementService.ts";
import { isUserStopCommandId } from "./t3team-actorMessageReactor.ts";
import {
  cascadeStopCommandId,
  collectSubagentDescendants,
  stopThreadCascade,
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
): Pick<OrchestrationV2ThreadShell, "id" | "lineage"> => ({
  id: ThreadId.make(id),
  lineage: {
    parentThreadId: parent === null ? null : ThreadId.make(parent),
    relationshipToParent,
    rootThreadId: ThreadId.make("root"),
  },
});

describe("collectSubagentDescendants", () => {
  it("walks subagent lineage breadth-first, skipping forks, other trees and cycles", () => {
    const shells = [
      node("root", null),
      node("a", "root"),
      node("b", "root"),
      node("a1", "a"),
      node("fork-of-root", "root", "fork"),
      node("fork-child", "fork-of-root"),
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

  it("derives per-thread command ids the mailbox and workflow engine read as user stops", () => {
    const id = cascadeStopCommandId("8a6f3c1e-2b4d-4c7a-9e1f-0a1b2c3d4e5f", "thread:child");
    assert.strictEqual(id, "t3team-cascade-stop:8a6f3c1e-2b4d-4c7a-9e1f-0a1b2c3d4e5f:thread:child");
    assert.isTrue(isUserStopCommandId(id));
  });
});

const TestLayer = ThreadManagementService.layer.pipe(
  Layer.provideMerge(makeT3TeamV2TestLayer("t3team-thread-stop-cascade")),
);

const startDeferredRun = (threadId: ThreadId) =>
  Effect.flatMap(Orchestrator.OrchestratorV2, (orchestrator) =>
    orchestrator.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`dispatch:${threadId}`),
      threadId,
      messageId: MessageId.make(`message:${threadId}`),
      text: "work",
      attachments: [],
      dispatchMode: { type: "defer_start" },
      createdBy: "user",
      creationSource: "web",
    }),
  );

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
});
