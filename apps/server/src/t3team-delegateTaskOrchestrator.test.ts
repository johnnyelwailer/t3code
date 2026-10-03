/**
 * `delegated_task.request.workspace`: the child runs in the provisioned checkout
 * instead of inheriting the parent's branch/worktree, and lineage stays `subagent`.
 */
import { assert, it } from "@effect/vitest";
import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "./orchestration-v2/ProjectionStore.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
  testModelSelection,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

const startParentRun = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    yield* createTestThread(threadId, "Parent");
    yield* orchestrator.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`dispatch:${threadId}`),
      threadId,
      messageId: MessageId.make(`message:${threadId}`),
      text: "Coordinate the work",
      attachments: [],
      dispatchMode: { type: "start_immediately" },
      createdBy: "user",
      creationSource: "web",
    });
    const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
    const run = runs[0];
    assert.ok(run?.rootNodeId);
    return { runId: run.id, nodeId: run.rootNodeId };
  });

const delegate = (input: {
  readonly parentThreadId: ThreadId;
  readonly key: string;
  readonly workspace?: { readonly branch: string | null; readonly worktreePath: string | null };
}) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const parentRun = yield* startParentRun(input.parentThreadId);
    const result = yield* orchestrator.dispatch({
      type: "delegated_task.request",
      commandId: CommandId.make(`delegate:${input.key}`),
      parentThreadId: input.parentThreadId,
      parentRunId: parentRun.runId,
      parentNodeId: parentRun.nodeId,
      task: "Implement the fix",
      modelSelection: testModelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      createdBy: "agent",
      creationSource: "mcp",
      ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    });
    const created = result.storedEvents.find((stored) => stored.event.type === "thread.created");
    assert.ok(created?.event.type === "thread.created");
    return yield* projections.getThread(created.event.payload.id);
  });

it.layer(makeT3TeamV2TestLayer("t3team-delegate-task-workspace"))(
  "delegated_task.request workspace",
  (it) => {
    it.effect("runs the child in the provided worktree and branch", () =>
      Effect.gen(function* () {
        const child = yield* delegate({
          parentThreadId: ThreadId.make("thread:delegate-ws-parent"),
          key: "with-workspace",
          workspace: { branch: "feature/child-1234", worktreePath: "/tmp/child-worktree" },
        });
        assert.strictEqual(child?.branch, "feature/child-1234");
        assert.strictEqual(child?.worktreePath, "/tmp/child-worktree");
        assert.strictEqual(child?.lineage.relationshipToParent, "subagent");
      }),
    );

    it.effect("inherits the parent's checkout when no workspace is given", () =>
      Effect.gen(function* () {
        const child = yield* delegate({
          parentThreadId: ThreadId.make("thread:delegate-inherit-parent"),
          key: "inherit",
        });
        assert.strictEqual(child?.branch, null);
        assert.strictEqual(child?.worktreePath, null);
      }),
    );
  },
);
