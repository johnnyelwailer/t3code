// @effect-diagnostics nodeBuiltinImport:off - config fixtures are real files under __fixtures__.
import * as NodeTimersPromises from "node:timers/promises";
import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { loadRecipeConfigLayers } from "./t3team-recipeConfigLoad.ts";
import { resolveRecipeConfigLayers } from "./t3team-recipeConfigResolve.ts";

const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const setUp = Effect.fn("setUp")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
    directory: fixturesRoot,
    prefix: "t3team-recipe-config-",
  });
  const state = path.join(workspaceRoot, PROJECT_STATE_DIR);
  const write = (relative: string, text: string) =>
    Effect.gen(function* () {
      const target = path.join(state, relative);
      yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true });
      yield* fileSystem.writeFileString(target, text);
      return target;
    });
  // The recipe, with its own defaults, and a second recipe a reference names.
  for (const id of ["pr-watch", "ies-ci-triage"]) {
    yield* write(
      `recipes/${id}/default.workflow.ts`,
      `export const meta = { name: "${id}" } as const;\nreturn {};`,
    );
    yield* write(
      `recipes/${id}/recipe.ts`,
      [
        `import { defineRecipe, defineWorkflow } from "@t3team/sdk";`,
        `export default defineRecipe({`,
        `  id: "${id}", version: "2.0.0", scope: "project", title: "${id}", shortDescription: "x",`,
        `  surfaces: ["project.dashboard.backlog"], appliesTo: {}, allowedToolGroups: [],`,
        `  defaultAction: defineWorkflow("./default.workflow.ts"),`,
        `  defaults: { foreignPrs: "report-only", duties: { fix: true, comments: true }, autoMerge: [] },`,
        `});`,
      ].join("\n"),
    );
  }
  yield* write(
    "policies/hive-merge.workflow.ts",
    `export const meta = { name: "hive-merge" } as const;\nreturn { mode: "manual" };`,
  );
  yield* write(
    "policies/ownership.ts",
    [
      `import { defineScript } from "@t3team/sdk";`,
      `import { Schema } from "effect";`,
      `export default defineScript({ inputs: Schema.Unknown, outputs: Schema.Unknown, handler: async () => "own" });`,
    ].join("\n"),
  );
  return { workspaceRoot, write, recipePath: path.join(state, "recipes/pr-watch") };
});

const CONFIG = [
  `import { defineRecipeConfig, defineWorkflow, recipeAction } from "@t3team/sdk";`,
  `import ownership from "../policies/ownership.ts";`,
  `const hiveMerge = defineWorkflow("../policies/hive-merge.workflow.ts");`,
  `export default defineRecipeConfig("pr-watch", {`,
  `  defaults: { ownership, duties: { fix: false } },`,
  `  scopes: [`,
  `    { repos: ["hive/*"], mergePolicy: hiveMerge, triage: recipeAction("ies-ci-triage") },`,
  `    { repos: ["hive/nx-nexi"], missing: recipeAction("no-such-recipe") },`,
  `  ],`,
  `});`,
].join("\n");

it.layer(NodeServices.layer)("recipe config loader", (it) => {
  it.effect("loads recipe defaults and the config, with every reference as data", () =>
    Effect.gen(function* () {
      const { workspaceRoot, write, recipePath } = yield* setUp();
      const file = yield* write("recipes/pr-watch.config.ts", CONFIG);
      const layers = yield* loadRecipeConfigLayers({
        workspaceRoot,
        recipeId: "pr-watch",
        recipePath,
      });
      const resolved = resolveRecipeConfigLayers(layers, { repository: "hive/nx-nexi" });
      assert.strictEqual(resolved.file, file);
      assert.deepStrictEqual(resolved.values.duties, { fix: false, comments: true });
      assert.strictEqual(resolved.values.foreignPrs, "report-only");
      assert.deepInclude(resolved.values.ownership as object, {
        kind: "script",
        export: "default",
      });
      assert.isTrue(
        String((resolved.values.ownership as { modulePath: string }).modulePath).endsWith(
          "policies/ownership.ts",
        ),
      );
      assert.isTrue(
        String((resolved.values.mergePolicy as { absolutePath: string }).absolutePath).endsWith(
          "hive-merge.workflow.ts",
        ),
      );
      assert.deepInclude(resolved.values.triage as object, {
        kind: "recipe-action",
        recipeId: "ies-ci-triage",
        action: "default",
        source: "project-local",
      });
      // An unresolvable reference is dropped with a warning naming file, key and line.
      assert.notProperty(resolved.values, "missing");
      assert.deepStrictEqual(
        resolved.warnings.map(({ key, line }) => ({ key, line })),
        [{ key: "missing", line: 8 }],
      );
      assert.include(resolved.warnings[0]?.message ?? "", "No recipe 'no-such-recipe'");
      assert.deepStrictEqual(resolved.sources.mergePolicy, { layer: "scope", index: 0, line: 7 });
    }),
  );

  it.effect("never imports a config with computed values; the recipe's defaults apply", () =>
    Effect.gen(function* () {
      const { workspaceRoot, write, recipePath } = yield* setUp();
      yield* write(
        "recipes/pr-watch.config.ts",
        [
          `import { defineRecipeConfig } from "@t3team/sdk";`,
          `globalThis.__configRan = true;`,
          `export default defineRecipeConfig("pr-watch", {`,
          `  defaults: { autoMerge: ["a", "b"].map((label) => label) },`,
          `});`,
        ].join("\n"),
      );
      const layers = yield* loadRecipeConfigLayers({
        workspaceRoot,
        recipeId: "pr-watch",
        recipePath,
      });
      assert.isUndefined((globalThis as { __configRan?: boolean }).__configRan);
      assert.deepStrictEqual(layers.defaults, {});
      assert.deepStrictEqual(layers.recipeDefaults.autoMerge, []);
      assert.deepStrictEqual(
        layers.warnings.map((warning) => warning.line),
        [2, 4],
      );
    }),
  );

  it.effect("re-imports only after the config changes", () =>
    Effect.gen(function* () {
      const { workspaceRoot, write, recipePath } = yield* setUp();
      yield* write(
        "recipes/pr-watch.config.ts",
        `import { defineRecipeConfig } from "@t3team/sdk";\nexport default defineRecipeConfig("pr-watch", { defaults: { model: "a" } });`,
      );
      const load = loadRecipeConfigLayers({ workspaceRoot, recipeId: "pr-watch", recipePath });
      const first = yield* load;
      assert.strictEqual(yield* load, first, "an unchanged config is served from the cache");
      yield* Effect.promise(() => NodeTimersPromises.setTimeout(20));
      yield* write(
        "recipes/pr-watch.config.ts",
        `import { defineRecipeConfig } from "@t3team/sdk";\nexport default defineRecipeConfig("pr-watch", { defaults: { model: "b" } });`,
      );
      assert.strictEqual((yield* load).defaults.model, "b");
    }),
  );

  it.effect("a project without a config file gets the recipe's defaults and no warnings", () =>
    Effect.gen(function* () {
      const { workspaceRoot, recipePath } = yield* setUp();
      const layers = yield* loadRecipeConfigLayers({
        workspaceRoot,
        recipeId: "pr-watch",
        recipePath,
      });
      assert.isNull(layers.file);
      assert.deepStrictEqual(layers.warnings, []);
      assert.strictEqual(layers.recipeDefaults.foreignPrs, "report-only");
    }),
  );
});
