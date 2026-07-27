/**
 * Pack-shipped recipes for the agent-facing `t3team.recipe.list`.
 *
 * The library the model is told to prefer ("run a fitting saved recipe by `path` rather than
 * re-authoring it") is PACK content, so the agent list has to enumerate the same registered pack
 * recipe roots the UI path uses ({@link ./t3team-packRecipeSources.ts}) — not a second scan of the
 * project tree. Loading goes through the shared per-directory loader
 * ({@link ./t3team-recipeAgentListEntry.ts}), so a pack recipe yields the same entry shape as a
 * project-local one, distinguished only by its `source`/`packId`/`packScope` label.
 *
 * Registration-level problems (a declared recipe that is not on disk, an authored id that
 * disagrees with the manifest) become diagnostics rather than errors: the agent needs to know the
 * library is incomplete, but nothing about the request failed.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { getPackRecipeSources } from "./t3team-packRecipeSources.ts";
import { listRecipeAtPath, type MutableListResult } from "./t3team-recipeAgentListEntry.ts";

/** Append every recipe contributed by an active pack to `out`. */
export const listPackRecipesForAgent = Effect.fn("listPackRecipesForAgent")(function* (input: {
  readonly out: MutableListResult;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const registered = getPackRecipeSources();
  input.out.diagnostics.push(...registered.diagnostics);

  for (const source of registered.sources) {
    if (!(yield* fileSystem.exists(source.recipeRoot).pipe(Effect.orElseSucceed(() => false)))) {
      input.out.diagnostics.push(
        `Pack ${source.packId} recipe ${source.declaredId} is missing at ${source.recipeRoot}.`,
      );
      continue;
    }
    const before = input.out.recipes.length;
    const found = yield* listRecipeAtPath({
      recipePath: source.recipeRoot,
      origin: { source: "pack", packId: source.packId, packScope: source.packScope },
      out: input.out,
    });
    if (!found) {
      input.out.diagnostics.push(
        `Pack ${source.packId} recipe ${source.declaredId} at ${source.recipeRoot} has neither recipe.ts nor recipe.json.`,
      );
      continue;
    }
    // Same id gate as UI discovery: a pack that declares one id but ships another would make the
    // manifest lie about what the agent can run, so the mismatched recipe is dropped and named.
    const loaded = input.out.recipes[before];
    if (loaded && loaded.id !== source.declaredId) {
      input.out.recipes.splice(before, 1);
      input.out.diagnostics.push(
        `Pack ${source.packId} declares recipe id ${source.declaredId} but the recipe at ${source.recipeRoot} has id ${loaded.id}; it is ignored.`,
      );
    }
  }
});
