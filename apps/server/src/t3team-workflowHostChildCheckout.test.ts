import { assert, it } from "@effect/vitest";
import { CommandId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ThreadManagementService from "./orchestration-v2/ThreadManagementService.ts";
import * as ThreadArtifactsStore from "./t3team-v2/t3team-threadArtifactsStore.ts";
import * as ThreadFactsStore from "./t3team-v2/t3team-threadFactsStore.ts";
import {
  makeT3TeamV2TestLayer,
  testModelSelection,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";
import * as WorkflowHost from "./t3team-workflowHost.ts";

const base = makeT3TeamV2TestLayer("t3team-workflow-host-child-checkout");
const TestLayer = WorkflowHost.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      ThreadManagementService.layer,
      ThreadArtifactsStore.layer,
      ThreadFactsStore.layer,
    ),
  ),
  Layer.provideMerge(base),
);

const projectId = ProjectId.make("project:t3team-v2");

it.layer(TestLayer)("workflow host child checkout", (it) => {
  it.effect("a child works in its launch thread's checkout only when it opts in", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadManagementService.ThreadManagementService;
      const host = yield* WorkflowHost.T3TeamWorkflowHost;
      const launch = ThreadId.make("thread:launch-on-worktree");
      yield* threads.dispatch({
        type: "thread.create",
        commandId: CommandId.make("create:launch-on-worktree"),
        threadId: launch,
        projectId,
        title: "Fix CI",
        modelSelection: testModelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "feature/pr-412",
        worktreePath: "/tmp/worktrees/pr-412",
        createdBy: "user",
        creationSource: "web",
      });
      const child = (id: string, parentThreadId?: string, inheritCheckout?: boolean) =>
        host.createThread({
          threadId: id,
          projectId,
          title: "Diagnose",
          modelSelection: testModelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          retention: "ephemeral",
          ...(parentThreadId === undefined ? {} : { parentThreadId }),
          ...(inheritCheckout === undefined ? {} : { inheritCheckout }),
        });
      const checkoutOf = (id: string) =>
        threads
          .getThreadShell(ThreadId.make(id))
          .pipe(Effect.map((shell) => [shell?.branch ?? null, shell?.worktreePath ?? null]));

      yield* child("thread:opted-in", launch, true);
      assert.deepStrictEqual(yield* checkoutOf("thread:opted-in"), [
        "feature/pr-412",
        "/tmp/worktrees/pr-412",
      ]);

      // Existing workflows did not opt in, so their children keep working in the project root.
      yield* child("thread:default", launch);
      assert.deepStrictEqual(yield* checkoutOf("thread:default"), [null, null]);

      // A headless run has no launch thread to inherit from.
      yield* child("thread:headless", undefined, true);
      assert.deepStrictEqual(yield* checkoutOf("thread:headless"), [null, null]);
    }),
  );
});
