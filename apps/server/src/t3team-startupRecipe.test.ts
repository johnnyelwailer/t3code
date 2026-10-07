import { ThreadId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  WorkflowRunRepository,
  type WorkflowRun,
  type WorkflowRunRepositoryShape,
} from "./persistence/WorkflowRuns.ts";
import type { PackRecipeSource } from "./t3team-packRecipeSources.ts";
import { launchStartupRecipe, resolveStartupRecipe } from "./t3team-startupRecipe.ts";

const source: PackRecipeSource = {
  packId: "nexplore-global",
  packVersion: "1.0.0",
  packScope: "distribution",
  declaredId: "machine-setup",
  recipeRoot: "/packs/nexplore-global/recipes/machine-setup",
};

describe("resolveStartupRecipe", () => {
  it("launches nothing when no recipe is named", () => {
    assert.deepStrictEqual(resolveStartupRecipe(undefined, [source]), { kind: "none" });
    assert.deepStrictEqual(resolveStartupRecipe("  ", [source]), { kind: "none" });
  });

  it("finds the named recipe among the pack sources", () => {
    assert.strictEqual(resolveStartupRecipe(" machine-setup ", [source]), source);
  });

  it("reports a named recipe no pack provides", () => {
    assert.deepStrictEqual(resolveStartupRecipe("nope", [source]), { kind: "missing", id: "nope" });
  });
});

describe("launchStartupRecipe", () => {
  it.effect("leaves a thread that already has a live run alone", () =>
    Effect.gen(function* () {
      const asked: Array<string> = [];
      const repository = {
        listLiveByLaunchThread: ({ launchThreadId }: { launchThreadId: string }) => {
          asked.push(launchThreadId);
          return Effect.succeed([{ runId: "r1" } as WorkflowRun]);
        },
      } as unknown as WorkflowRunRepositoryShape;
      const result = yield* launchStartupRecipe({
        threadId: ThreadId.make("t1"),
        recipe: source,
      }).pipe(
        // The launch's other services are never reached: the live run stops it first.
        Effect.provideService(WorkflowRunRepository, repository),
      ) as Effect.Effect<unknown>;
      assert.isNull(result);
      assert.deepStrictEqual(asked, ["t1"]);
    }),
  );
});
