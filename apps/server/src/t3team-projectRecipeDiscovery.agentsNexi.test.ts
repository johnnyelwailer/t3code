import * as NodeServices from "@effect/platform-node/NodeServices";
import { createQueryable } from "@t3tools/project-context";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { discoverProjectRecipes } from "./t3team-projectRecipeDiscovery.js";

const context = {
  surface: "workitem.detail.sidepanel",
  project: { title: "Project Alpha", provider: "atlassian" },
  linkedResources: createQueryable([]),
  artifacts: createQueryable([]),
  profile: {
    technicalDepth: "medium",
    brevity: "balanced",
    guidanceStyle: "guided",
    detailDensity: "balanced",
    preferredArtifactKinds: [],
    defaultActionFamilies: [],
    defaultRecipeWeights: {},
  },
  enabledSkillPacks: [],
  schema: {},
  availableContextKeys: createQueryable([]),
} as never;

const recipeJson = (title: string) =>
  JSON.stringify({
    id: "same",
    version: "0.1.0",
    scope: "project",
    displayName: title,
    shortDescription: title,
    surfaces: ["workitem.detail.sidepanel"],
    prompt: "./prompt.md",
  });

const workspaceWith = Effect.fn("workspaceWith")(function* (files: Record<string, string>) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-recipes-dual-" });
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    yield* fileSystem.makeDirectory(path.dirname(absolute), { recursive: true });
    yield* fileSystem.writeFileString(absolute, contents);
  }
  return root;
});

it.layer(NodeServices.layer)(
  "discoverProjectRecipes reads .agents/nexi and the legacy .nexi",
  (it) => {
    describe("recipe directories", () => {
      it.effect("finds a recipe only the legacy dir holds", () =>
        Effect.gen(function* () {
          const workspaceRoot = yield* workspaceWith({
            ".nexi/recipes/same/recipe.json": recipeJson("Legacy"),
            ".nexi/recipes/same/prompt.md": "p",
          });
          const result = yield* discoverProjectRecipes({ workspaceRoot, context });
          expect(result.hasProjectLocalRecipes).toBe(true);
          expect(result.recipes.map((recipe) => recipe.displayName)).toEqual(["Legacy"]);
        }),
      );

      it.effect("the new dir wins and the legacy copy is reported as shadowed", () =>
        Effect.gen(function* () {
          const workspaceRoot = yield* workspaceWith({
            ".agents/nexi/recipes/same/recipe.json": recipeJson("New"),
            ".agents/nexi/recipes/same/prompt.md": "p",
            ".nexi/recipes/same/recipe.json": recipeJson("Legacy"),
            ".nexi/recipes/same/prompt.md": "p",
          });
          const result = yield* discoverProjectRecipes({ workspaceRoot, context });
          expect(result.recipes.map((recipe) => recipe.displayName)).toEqual(["New"]);
          expect(result.diagnostics).toEqual([
            expect.stringContaining(
              "/.nexi/recipes/same is shadowed by the same recipe in a newer",
            ),
          ]);
        }),
      );

      it.effect("a broken new recipe is never replaced by the legacy one of the same name", () =>
        Effect.gen(function* () {
          const workspaceRoot = yield* workspaceWith({
            ".agents/nexi/recipes/same/recipe.json": "{ not json",
            ".nexi/recipes/same/recipe.json": recipeJson("Legacy"),
            ".nexi/recipes/same/prompt.md": "p",
          });
          const result = yield* discoverProjectRecipes({ workspaceRoot, context });
          expect(result.recipes).toEqual([]);
        }),
      );
    });
  },
);
