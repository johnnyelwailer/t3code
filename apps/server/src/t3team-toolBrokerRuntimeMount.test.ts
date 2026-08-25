import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { vi } from "vite-plus/test";

import { GitWorkflowService } from "./git/GitWorkflowService.ts";
import { mountT3TeamBrokerBeforeRuntimeServices } from "./server.ts";

it.effect("exposes the own-worktree Git service while the production broker layer is built", () => {
  const createWorktree = vi.fn(() =>
    Effect.succeed({
      worktree: { refName: "feature/child", path: "/workspace/child" },
    }),
  );
  const gitWorkflowLayer = Layer.succeed(GitWorkflowService, {
    createWorktree,
  } as unknown as GitWorkflowService["Service"]);
  const brokerConstructionProbe = Layer.effectDiscard(
    Effect.gen(function* () {
      const workflow = Option.getOrUndefined(yield* Effect.serviceOption(GitWorkflowService));
      assert.isDefined(workflow);
      yield* workflow.createWorktree({
        cwd: "/workspace/project",
        refName: "main",
        newRefName: "feature/child",
        baseRefName: "main",
        path: "/workspace/child",
      });
    }),
  );
  const productionOrderedLayer = mountT3TeamBrokerBeforeRuntimeServices(
    Layer.empty,
    brokerConstructionProbe,
  ).pipe(Layer.provideMerge(gitWorkflowLayer));

  return Layer.build(productionOrderedLayer).pipe(
    Effect.scoped,
    Effect.andThen(() => Effect.sync(() => assert.equal(createWorktree.mock.calls.length, 1))),
  );
});
