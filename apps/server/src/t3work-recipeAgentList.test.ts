/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { describe, expect, it } from "vite-plus/test";

import { listProjectRecipesForAgent } from "./t3work-recipeAgentList.ts";

// Temp workspaces live under `__fixtures__` (not the OS tmpdir) so a typed `recipe.ts`'s
// `import("@t3work/sdk")` resolves via the monorepo's node_modules chain, the same way
// `t3work-projectRecipeDiscoveryModule.test.ts` does.
const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const makeTempWorkspace = Effect.fn("makeTempWorkspace")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({
    directory: fixturesRoot,
    prefix: "t3work-recipe-agent-list-",
  });
});

const writeTypedRecipe = Effect.fn("writeTypedRecipe")(function* (input: {
  readonly workspaceRoot: string;
  readonly recipeId: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const recipeRoot = path.join(input.workspaceRoot, ".t3work/recipes", input.recipeId);
  yield* fileSystem.makeDirectory(recipeRoot, { recursive: true });
  yield* fileSystem.writeFileString(
    path.join(recipeRoot, `${input.recipeId}.workflow.ts`),
    [
      `export const meta = { name: "${input.recipeId}.workflow" } as const;`,
      `return { done: true };`,
    ].join("\n"),
  );
  yield* fileSystem.writeFileString(
    path.join(recipeRoot, "recipe.ts"),
    [
      `import { defineRecipe, defineWorkflow } from "@t3work/sdk";`,
      `export default defineRecipe({`,
      `  id: "${input.recipeId}",`,
      `  version: "0.1.0",`,
      `  scope: "project",`,
      `  title: "Typed recipe ${input.recipeId}",`,
      `  shortDescription: "A typed recipe used for agent-list testing.",`,
      `  surfaces: ["project.dashboard.backlog"],`,
      `  appliesTo: {},`,
      `  allowedToolGroups: [],`,
      `  defaultAction: defineWorkflow("./${input.recipeId}.workflow.ts"),`,
      `});`,
    ].join("\n"),
  );
});

const writeLegacyRecipe = Effect.fn("writeLegacyRecipe")(function* (input: {
  readonly workspaceRoot: string;
  readonly recipeId: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const recipeRoot = path.join(input.workspaceRoot, ".t3work/recipes", input.recipeId);
  yield* fileSystem.makeDirectory(recipeRoot, { recursive: true });
  yield* fileSystem.writeFileString(path.join(recipeRoot, "prompt.md"), "Do the thing.");
  yield* fileSystem.writeFileString(
    path.join(recipeRoot, "recipe.json"),
    `{
  "id": "${input.recipeId}",
  "version": "0.1.0",
  "scope": "project",
  "displayName": "Legacy recipe ${input.recipeId}",
  "shortDescription": "A legacy recipe.json recipe used for agent-list testing.",
  "surfaces": ["project.dashboard.backlog"],
  "prompt": "./prompt.md"
}`,
  );
});

const writeBrokenRecipe = Effect.fn("writeBrokenRecipe")(function* (input: {
  readonly workspaceRoot: string;
  readonly recipeId: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const recipeRoot = path.join(input.workspaceRoot, ".t3work/recipes", input.recipeId);
  yield* fileSystem.makeDirectory(recipeRoot, { recursive: true });
  yield* fileSystem.writeFileString(path.join(recipeRoot, "recipe.json"), "{ not valid json ");
});

describe("listProjectRecipesForAgent", () => {
  it("lists typed and legacy recipes, and reports a broken recipe.json as a structured error", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          yield* writeTypedRecipe({ workspaceRoot, recipeId: "typed-recipe" });
          yield* writeLegacyRecipe({ workspaceRoot, recipeId: "legacy-recipe" });
          yield* writeBrokenRecipe({ workspaceRoot, recipeId: "broken-recipe" });

          const result = yield* listProjectRecipesForAgent({ workspaceRoot });

          expect(result.ok).toBe(true);
          expect(result.recipes).toHaveLength(2);

          const typed = result.recipes.find((recipe) => recipe.id === "typed-recipe");
          expect(typed).toMatchObject({
            id: "typed-recipe",
            title: "Typed recipe typed-recipe",
            shortDescription: "A typed recipe used for agent-list testing.",
            surfaces: ["project.dashboard.backlog"],
            authoring: "recipe-ts",
            source: "project-local",
            recipePath: expect.stringContaining("/typed-recipe"),
            workflowPath: expect.stringContaining("/typed-recipe/typed-recipe.workflow.ts"),
          });

          const legacy = result.recipes.find((recipe) => recipe.id === "legacy-recipe");
          expect(legacy).toMatchObject({
            id: "legacy-recipe",
            title: "Legacy recipe legacy-recipe",
            shortDescription: "A legacy recipe.json recipe used for agent-list testing.",
            surfaces: ["project.dashboard.backlog"],
            authoring: "recipe-json",
            source: "project-local",
            recipePath: expect.stringContaining("/legacy-recipe"),
          });
          // Legacy manifest declares no `workflow` field, so no workflowPath is resolved.
          expect(legacy?.workflowPath).toBeUndefined();

          expect(result.errors).toHaveLength(1);
          expect(result.errors[0]).toMatchObject({
            path: expect.stringContaining("/broken-recipe/recipe.json"),
            phase: "load",
            message: expect.any(String),
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("returns an empty result when the recipes root does not exist", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();

          const result = yield* listProjectRecipesForAgent({ workspaceRoot });

          expect(result.ok).toBe(true);
          expect(result.recipes).toEqual([]);
          expect(result.errors).toEqual([]);
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });
});
