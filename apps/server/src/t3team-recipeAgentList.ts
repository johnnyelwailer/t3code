/**
 * `t3team.recipe.list` implementation: an authoring-oriented, read-only inventory of every recipe
 * the agent can act on — the project's `.t3team/recipes/*` directories AND the recipes shipped by
 * active packs. Unlike UI discovery ({@link ./t3team-projectRecipeDiscovery.ts}) it does NOT filter
 * by surface or visibility — an agent editing or running recipes needs to see every recipe on disk,
 * including ones the current view would hide — but it enumerates pack sources from the same
 * registry and applies the same id precedence, so the agent sees the same library the user does.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { ListRecipesToolResult } from "@t3team/sdk";

import { mergeRecipesByPrecedence, PROJECT_LOCAL_ORIGIN } from "./t3team-projectRecipeOrigin.ts";
import { projectStateReadPaths } from "./t3team-projectStateReadRoots.ts";
import { listRecipeAtPath, type MutableListResult } from "./t3team-recipeAgentListEntry.ts";
import { listPackRecipesForAgent } from "./t3team-recipeAgentListPack.ts";
import { offeredRecipes } from "./t3team-workItemDeliveryRecipesFlag.ts";

/** Enumerate `<workspaceRoot>/<state dir>/recipes/*` (every read dir), appending each recipe directory to `out`. */
const listProjectLocalRecipes = Effect.fn("listProjectLocalRecipes")(function* (input: {
  readonly workspaceRoot: string;
  readonly out: MutableListResult;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const seenEntries = new Set<string>();
  // Every state dir is read, newest first; a same-named recipe directory in an older one is shadowed.
  for (const recipesRoot of projectStateReadPaths(pathService, input.workspaceRoot, "recipes")) {
    if (!(yield* fileSystem.exists(recipesRoot).pipe(Effect.orElseSucceed(() => false)))) {
      continue;
    }
    for (const entry of yield* fileSystem.readDirectory(recipesRoot, { recursive: false })) {
      const recipePath = pathService.join(recipesRoot, entry);
      const entryStat = yield* fileSystem
        .stat(recipePath)
        .pipe(Effect.catch(() => Effect.succeed(null)));
      if (!entryStat || entryStat.type !== "Directory") {
        continue;
      }
      if (seenEntries.has(entry)) {
        input.out.diagnostics.push(
          `Recipe directory ${recipePath} is shadowed by the same recipe in a newer state directory.`,
        );
        continue;
      }
      seenEntries.add(entry);
      yield* listRecipeAtPath({ recipePath, origin: PROJECT_LOCAL_ORIGIN, out: input.out });
    }
  }
});

/**
 * List every recipe the agent can run — pack-shipped and project-local — with structured
 * per-recipe load errors and source-level diagnostics.
 */
export const listProjectRecipesForAgent = Effect.fn("listProjectRecipesForAgent")(
  function* (input: { readonly workspaceRoot: string }) {
    const pathService = yield* Path.Path;
    const workspaceRoot = pathService.resolve(input.workspaceRoot);
    const out: MutableListResult = { recipes: [], errors: [], diagnostics: [] };

    // Pack recipes first so a project-local recipe of the same id wins the merge below.
    yield* listPackRecipesForAgent({ out });
    yield* listProjectLocalRecipes({ workspaceRoot, out });

    const merged = mergeRecipesByPrecedence(out.recipes);
    const diagnostics = [...out.diagnostics, ...merged.diagnostics];
    return {
      ok: true as const,
      workspaceRoot,
      recipes: offeredRecipes(merged.recipes).toSorted((left, right) =>
        left.id.localeCompare(right.id),
      ),
      errors: out.errors,
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
    } satisfies ListRecipesToolResult;
  },
);
