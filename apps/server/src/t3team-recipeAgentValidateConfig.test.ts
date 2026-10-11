// @effect-diagnostics nodeBuiltinImport:off - config fixtures are real files under __fixtures__.
import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { validateProjectRecipeWorkflowForAgent } from "./t3team-recipeAgentValidate.ts";

const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const workspaceWith = Effect.fn("workspaceWith")(function* (config: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
    directory: fixturesRoot,
    prefix: "t3team-validate-config-",
  });
  const recipe = path.join(workspaceRoot, PROJECT_STATE_DIR, "recipes", "pr-watch");
  yield* fileSystem.makeDirectory(recipe, { recursive: true });
  yield* fileSystem.writeFileString(
    path.join(recipe, "default.workflow.ts"),
    `export const meta = { name: "pr-watch" } as const;\nreturn {};`,
  );
  yield* fileSystem.writeFileString(
    path.join(recipe, "recipe.ts"),
    [
      `import { defineRecipe, defineWorkflow } from "@t3team/sdk";`,
      `export default defineRecipe({ id: "pr-watch", version: "2.0.0", scope: "project",`,
      `  title: "PR watch", shortDescription: "x", surfaces: ["project.dashboard.backlog"],`,
      `  appliesTo: {}, allowedToolGroups: [], defaultAction: defineWorkflow("./default.workflow.ts") });`,
    ].join("\n"),
  );
  const configPath = path.join(workspaceRoot, PROJECT_STATE_DIR, "recipes", "pr-watch.config.ts");
  yield* fileSystem.writeFileString(configPath, config);
  return { workspaceRoot, configPath };
});

it.layer(NodeServices.layer)("t3_recipe_validate on a recipe config", (it) => {
  it.effect("passes a data-only config whose references resolve", () =>
    Effect.gen(function* () {
      const { workspaceRoot, configPath } = yield* workspaceWith(
        [
          `import { defineRecipeConfig } from "@t3team/sdk";`,
          `export default defineRecipeConfig("pr-watch", { scopes: [{ repos: ["hive/*"], autoMerge: ["x"] }] });`,
        ].join("\n"),
      );
      const result = yield* validateProjectRecipeWorkflowForAgent({
        workspaceRoot,
        path: configPath,
      });
      assert.deepStrictEqual(result, { ok: true, errors: [] });
    }),
  );

  it.effect("reports computed values and unresolved references with their lines", () =>
    Effect.gen(function* () {
      const { workspaceRoot, configPath } = yield* workspaceWith(
        [
          `import { defineRecipeConfig } from "@t3team/sdk";`,
          `export default defineRecipeConfig("pr-watch", {`,
          `  defaults: { autoMerge: ["a"].concat(["b"]) },`,
          `});`,
        ].join("\n"),
      );
      const computed = yield* validateProjectRecipeWorkflowForAgent({
        workspaceRoot,
        path: configPath,
      });
      assert.isFalse(computed.ok);
      assert.deepStrictEqual(
        computed.errors.map((error) => [error.phase, error.message.slice(0, 7)]),
        [["format", "line 3:"]],
      );

      const fileSystem = yield* FileSystem.FileSystem;
      yield* fileSystem.writeFileString(
        configPath,
        [
          `import { defineRecipeConfig, recipeAction } from "@t3team/sdk";`,
          `export default defineRecipeConfig("pr-watch", {`,
          `  defaults: { triage: recipeAction("ies-ci-triage") },`,
          `});`,
        ].join("\n"),
      );
      const unresolved = yield* validateProjectRecipeWorkflowForAgent({
        workspaceRoot,
        path: configPath,
      });
      assert.isFalse(unresolved.ok);
      assert.strictEqual(unresolved.errors[0]?.phase, "load");
      assert.include(
        unresolved.errors[0]?.message ?? "",
        "line 3: triage: No recipe 'ies-ci-triage'",
      );
    }),
  );
});
