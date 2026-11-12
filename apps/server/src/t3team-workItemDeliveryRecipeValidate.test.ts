import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { afterAll, beforeAll } from "vite-plus/test";

import { renderBundledRecipeSetupFiles } from "./t3team-projectSetupRecipes.ts";
import { T3TEAM_PROJECT_RECIPES_ROOT } from "./t3team-projectSetupShared.ts";
import { validateProjectRecipeWorkflowForAgent } from "./t3team-recipeAgentValidate.ts";

// Under `__fixtures__` (not the OS tmpdir) so the scaffolded `recipe.ts`'s `@t3team/sdk` import
// resolves through the monorepo's node_modules, as in t3team-recipeAgentValidate.test.ts.
const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const scaffoldWorkspace = Effect.fn("scaffoldWorkspace")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
    directory: fixturesRoot,
    prefix: "t3team-work-item-validate-",
  });
  for (const file of renderBundledRecipeSetupFiles()) {
    const target = path.join(workspaceRoot, file.relativePath);
    yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true });
    yield* fileSystem.writeFileString(target, file.contents);
  }
  return workspaceRoot;
});

beforeAll(() => replaceFeatureFlagPresetValues(new Map([["WORKITEM_DELIVERY_RECIPES", true]])));
afterAll(() => replaceFeatureFlagPresetValues(new Map()));

const SCAFFOLDED_PATHS = [
  "fix-this-bug",
  "fix-this-bug/unit.workflow.ts",
  "implement-this",
  "implement-this/unit.workflow.ts",
].map((relative) => `${T3TEAM_PROJECT_RECIPES_ROOT}/${relative}`);

it.effect.each(SCAFFOLDED_PATHS)("the recipe validator accepts the scaffolded %s", (path) =>
  Effect.scoped(
    Effect.gen(function* () {
      const workspaceRoot = yield* scaffoldWorkspace();
      const result = yield* validateProjectRecipeWorkflowForAgent({ workspaceRoot, path });
      assert.deepStrictEqual(result.errors, []);
      assert.isTrue(result.ok);
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
);
