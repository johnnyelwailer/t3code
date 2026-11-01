import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { createQueryable } from "@t3tools/project-context";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import { RETIRED_BUNDLED_RECIPE_IDS } from "@t3tools/t3team-skill-packs";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { afterEach, describe, expect } from "vite-plus/test";

import { discoverProjectRecipes } from "./t3team-projectRecipeDiscovery.ts";
import { importRecipeModuleRef } from "./t3team-projectRecipeDiscoveryModule.ts";
import { backlogRenderContext } from "./t3team-projectRecipeRenderContext.fixtures.ts";
import { renderBundledRecipeSetupFiles } from "./t3team-projectSetupRecipes.ts";
import { T3TEAM_PROJECT_RECIPES_ROOT } from "./t3team-projectSetupShared.ts";
import { listProjectRecipesForAgent } from "./t3team-recipeAgentList.ts";
import { offeredDiscoveredRecipes } from "./t3team-workItemDeliveryRecipesFlag.ts";

// Under `__fixtures__` so the scaffolded `recipe.ts`'s `@t3team/sdk` import resolves.
const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));
const REWRITE = `${T3TEAM_PROJECT_RECIPES_ROOT}/describe-rewrite`;

const setExamples = (enabled: boolean) =>
  replaceFeatureFlagPresetValues(new Map([["BUNDLED_RECIPE_EXAMPLES", enabled]]));

/** A project as it looks after an older setup: every bundled recipe scaffolded, plus one recipe the
 * user made with a new id. Then the examples flag goes back to its default (off). */
const oldProject = Effect.fn("oldProject")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
    directory: fixturesRoot,
    prefix: "t3team-retired-recipes-",
  });
  setExamples(true);
  const files = renderBundledRecipeSetupFiles();
  const manage = files.find((file) =>
    file.relativePath.endsWith("/manage-project-recipes/recipe.ts"),
  );
  const prompt = files.find((file) =>
    file.relativePath.endsWith("/manage-project-recipes/prompt.md"),
  );
  const created = [
    {
      relativePath: `${T3TEAM_PROJECT_RECIPES_ROOT}/my-new-recipe/recipe.ts`,
      contents: (manage?.contents ?? "").replace("manage-project-recipes", "my-new-recipe"),
    },
    {
      relativePath: `${T3TEAM_PROJECT_RECIPES_ROOT}/my-new-recipe/prompt.md`,
      contents: prompt?.contents ?? "",
    },
  ];
  for (const file of [...files, ...created]) {
    const target = path.join(workspaceRoot, file.relativePath);
    yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true });
    yield* fileSystem.writeFileString(target, file.contents);
  }
  setExamples(false);
  return workspaceRoot;
});

const ticketContext = () =>
  backlogRenderContext({
    surface: "workitem.detail.sidepanel",
    availableContextKeys: createQueryable(["project.summary", "ticket.summary"]),
  });

describe("retired bundled recipe copies behind BUNDLED_RECIPE_EXAMPLES", () => {
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it("hides retired and feature-backing ids from non-pack recipes only, never a new id", () => {
    const recipes = [
      { id: "stakeholder-update", source: "project-local" },
      { id: "stakeholder-update", source: "pack" },
      { id: "describe-rewrite", source: "project-local" },
      { id: "manage-project-recipes", source: "project-local" },
      { id: "a-redesigned-recipe", source: "project-local" },
    ];
    expect(offeredDiscoveredRecipes(recipes)).toEqual([
      { id: "stakeholder-update", source: "pack" },
      { id: "manage-project-recipes", source: "project-local" },
      { id: "a-redesigned-recipe", source: "project-local" },
    ]);
    setExamples(true);
    expect(offeredDiscoveredRecipes(recipes)).toEqual(recipes);
  });

  it.effect(
    "an old project lists only its kept and new recipes, and the Rewrite recipe still launches by path",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const workspaceRoot = yield* oldProject();
          const retired = new Set([...RETIRED_BUNDLED_RECIPE_IDS, "describe-rewrite"]);

          const discovered = yield* discoverProjectRecipes({
            workspaceRoot,
            context: ticketContext(),
          });
          const offered = discovered.recipes.map((recipe) => recipe.id).toSorted();
          assert.deepStrictEqual(offered, ["manage-project-recipes", "my-new-recipe"]);

          const listed = yield* listProjectRecipesForAgent({ workspaceRoot });
          const listedIds = listed.recipes.map((recipe) => recipe.id).toSorted();
          assert.deepStrictEqual(listedIds, ["manage-project-recipes", "my-new-recipe"]);
          expect(listedIds.some((id) => retired.has(id))).toBe(false);

          // By-path launch does not go through discovery: the module still imports and resolves.
          const ref = yield* importRecipeModuleRef(path.join(workspaceRoot, REWRITE, "recipe.ts"));
          assert.strictEqual(ref.id, "describe-rewrite");

          setExamples(true);
          const withExamples = yield* discoverProjectRecipes({
            workspaceRoot,
            context: ticketContext(),
          });
          expect(withExamples.recipes.map((recipe) => recipe.id)).toContain("describe-rewrite");
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );
});
