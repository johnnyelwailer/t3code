/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
import { ThreadId } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { describe, expect, it } from "vite-plus/test";

import { makeRecipeToolHandlers } from "./t3team-toolBrokerRecipeTools.ts";

const threadId = ThreadId.make("thread-1");

describe("makeRecipeToolHandlers", () => {
  it("fails with a clear error when the thread's project has no workspace root", async () => {
    const handlers = makeRecipeToolHandlers({
      fileSystem: {} as FileSystem.FileSystem,
      path: {} as Path.Path,
      loadThreadProject: () => Effect.succeed({ project: { workspaceRoot: undefined } }),
    })(threadId);

    const result = await Effect.runPromise(handlers.listRecipes().pipe(Effect.result));

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBe("Current t3team project has no workspace root.");
    }
  });

  it("fails with a clear error when loadThreadProject itself fails", async () => {
    const handlers = makeRecipeToolHandlers({
      fileSystem: {} as FileSystem.FileSystem,
      path: {} as Path.Path,
      loadThreadProject: () => Effect.fail("thread not found"),
    })(threadId);

    const result = await Effect.runPromise(handlers.listRecipes().pipe(Effect.result));

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBe("thread not found");
    }
  });

  it("fails with a 'not available in this runtime' error when FileSystem/Path are missing", async () => {
    const handlers = makeRecipeToolHandlers({
      fileSystem: undefined,
      path: undefined,
      loadThreadProject: () =>
        Effect.succeed({ project: { workspaceRoot: "/workspace/project-1" } }),
    })(threadId);

    const listResult = await Effect.runPromise(handlers.listRecipes().pipe(Effect.result));
    const validateResult = await Effect.runPromise(
      handlers.validateRecipe({ path: "some.workflow.ts" }).pipe(Effect.result),
    );

    expect(listResult._tag).toBe("Failure");
    if (listResult._tag === "Failure") {
      expect(listResult.failure).toContain("not available");
      expect(listResult.failure).toContain("in this runtime");
    }
    expect(validateResult._tag).toBe("Failure");
    if (validateResult._tag === "Failure") {
      expect(validateResult.failure).toContain("not available");
      expect(validateResult.failure).toContain("in this runtime");
    }
  });

  it("wires listRecipes through a temp workspace on the happy path", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "t3team-recipe-tool-handlers-",
          });
          const recipeRoot = path.join(workspaceRoot, ".t3team/recipes/legacy-recipe");
          yield* fileSystem.makeDirectory(recipeRoot, { recursive: true });
          yield* fileSystem.writeFileString(path.join(recipeRoot, "prompt.md"), "Do the thing.");
          yield* fileSystem.writeFileString(
            path.join(recipeRoot, "recipe.json"),
            `{
  "id": "legacy-recipe",
  "version": "0.1.0",
  "scope": "project",
  "displayName": "Legacy recipe",
  "shortDescription": "A legacy recipe for handler-level testing.",
  "surfaces": ["project.dashboard.backlog"],
  "prompt": "./prompt.md"
}`,
          );

          const handlers = makeRecipeToolHandlers({
            fileSystem,
            path,
            loadThreadProject: () => Effect.succeed({ project: { workspaceRoot } }),
          })(threadId);

          const result = yield* handlers.listRecipes();

          expect(result.ok).toBe(true);
          expect(result.recipes).toHaveLength(1);
          expect(result.recipes[0]).toMatchObject({
            id: "legacy-recipe",
            authoring: "recipe-json",
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });
});
