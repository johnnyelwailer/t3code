import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { assert, describe, it } from "@effect/vitest";

import { listManagedProjectRecipes } from "./t3work-projectRecipeManagementRead.ts";
import {
  deleteManagedProjectRecipe,
  updateManagedProjectRecipe,
} from "./t3work-projectRecipeManagementMutations.ts";

const writeRecipe = Effect.fn("writeManagedRecipeFixture")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3work-managed-" });
  const recipePath = path.join(workspaceRoot, ".t3work/recipes/release-checklist");
  yield* fileSystem.makeDirectory(recipePath, { recursive: true });
  yield* fileSystem.writeFileString(
    path.join(recipePath, "recipe.json"),
    `{
  "id": "release-checklist",
  "version": "1.0.0",
  "scope": "project",
  "displayName": "Release checklist",
  "shortDescription": "Prepare the release.",
  "surfaces": ["project.dashboard.backlog"],
  "prompt": "./prompt.md"
}`,
  );
  yield* fileSystem.writeFileString(path.join(recipePath, "prompt.md"), "Prepare release notes.");
  return { workspaceRoot, recipePath };
});

describe("project recipe management", () => {
  it.effect("lists, edits, deactivates, and deletes project recipes", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { workspaceRoot, recipePath } = yield* writeRecipe();
        const listed = yield* listManagedProjectRecipes(workspaceRoot);
        assert.deepInclude(listed.recipes[0], {
          id: "release-checklist",
          active: true,
          editable: true,
          prompt: "Prepare release notes.",
        });

        const updated = yield* updateManagedProjectRecipe({
          workspaceRoot,
          recipePath,
          active: false,
          displayName: "Ship checklist",
          shortDescription: "Prepare the ship checklist.",
          prompt: "Prepare a ship checklist.",
        });
        assert.deepInclude(updated.recipe, {
          displayName: "Ship checklist",
          active: false,
          prompt: "Prepare a ship checklist.",
        });

        yield* deleteManagedProjectRecipe({ workspaceRoot, recipePath });
        const afterDelete = yield* listManagedProjectRecipes(workspaceRoot);
        assert.deepStrictEqual(afterDelete.recipes, []);
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );
});
