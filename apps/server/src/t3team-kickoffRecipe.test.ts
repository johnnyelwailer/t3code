import { ThreadId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import {
  WorkflowRunRepository,
  type WorkflowRun,
  type WorkflowRunRepositoryShape,
} from "./persistence/WorkflowRuns.ts";
import type { PackRecipeSource } from "./t3team-packRecipeSources.ts";
import {
  launchKickoffRecipe,
  runsOfWorkflow,
  resolveKickoffRecipe,
  userMessageText,
} from "./t3team-kickoffRecipe.ts";

const source: PackRecipeSource = {
  packId: "nexplore-global",
  packVersion: "1.0.0",
  packScope: "distribution",
  declaredId: "machine-setup",
  recipeRoot: "/packs/nexplore-global/recipes/machine-setup",
};

describe("resolveKickoffRecipe", () => {
  it("launches nothing when no recipe is named", () => {
    assert.deepStrictEqual(resolveKickoffRecipe(undefined, [source]), { kind: "none" });
    assert.deepStrictEqual(resolveKickoffRecipe("  ", [source]), { kind: "none" });
  });

  it("finds the named recipe among the pack sources", () => {
    assert.strictEqual(resolveKickoffRecipe(" machine-setup ", [source]), source);
  });

  it("reports a named recipe no pack provides", () => {
    assert.deepStrictEqual(resolveKickoffRecipe("nope", [source]), { kind: "missing", id: "nope" });
  });
});

describe("launchKickoffRecipe", () => {
  it.effect("leaves a thread that already ran the recipe alone, even when that run ended", () =>
    Effect.gen(function* () {
      const asked: Array<unknown> = [];
      const repository = {
        listLiveByLaunchThread: (input: { launchThreadId: string; includeEnded?: boolean }) => {
          asked.push(input);
          const runs: ReadonlyArray<Partial<WorkflowRun>> = [
            { runId: "r0", workflowPath: "/packs/other/workflow.ts", status: "completed" },
            { runId: "r1", workflowPath: `${source.recipeRoot}/workflow.ts`, status: "completed" },
          ];
          return Effect.succeed(runs);
        },
      } as unknown as WorkflowRunRepositoryShape;
      // @effect-diagnostics-next-line unsafeEffectTypeAssertion:off - The earlier run returns before any other service is reached.
      const result = yield* launchKickoffRecipe({
        threadId: ThreadId.make("t1"),
        recipe: source,
        firstMessage: "run the tests",
      }).pipe(
        // The launch's other services are never reached: the earlier run stops it first.
        Effect.provideService(WorkflowRunRepository, repository),
        Effect.provide(Path.layer),
      ) as Effect.Effect<unknown>;
      assert.isNull(result);
      assert.deepStrictEqual(asked, [{ launchThreadId: "t1", includeEnded: true }]);
    }),
  );
});

describe("runsOfWorkflow", () => {
  it("counts an ended run of the same workflow, and not a run of another one", () => {
    const path = "/packs/a/workflow.ts";
    const runs = [
      { runId: "other", workflowPath: "/packs/b/workflow.ts" },
      { runId: "same", workflowPath: path },
    ];
    assert.deepStrictEqual(
      runsOfWorkflow(runs, path).map((run) => run.runId),
      ["same"],
    );
    assert.deepStrictEqual(runsOfWorkflow([runs[0]!], path), []);
  });
});

describe("userMessageText", () => {
  const thread = ThreadId.make("t1");
  const message = (overrides: Record<string, unknown>) =>
    ({
      event: {
        type: "message.updated",
        threadId: "t1",
        payload: { role: "user", createdBy: "user", text: "fix the build", ...overrides },
      },
    }) as never;

  it("takes a message the user typed on the thread", () => {
    assert.strictEqual(userMessageText(message({}), thread), "fix the build");
  });

  it("ignores the agent, the system, and other threads", () => {
    assert.isUndefined(userMessageText(message({ role: "assistant" }), thread));
    assert.isUndefined(userMessageText(message({ createdBy: "system" }), thread));
    assert.isUndefined(userMessageText(message({}), ThreadId.make("t2")));
  });
});
