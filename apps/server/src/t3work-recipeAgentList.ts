/**
 * `t3work.recipe.list` implementation: an authoring-oriented, read-only inventory of every recipe
 * the agent can act on — the project's `.t3work/recipes/*` directories AND the recipes shipped by
 * active packs. Unlike UI discovery ({@link ./t3work-projectRecipeDiscovery.ts}) it does NOT filter
 * by surface or visibility — an agent editing or running recipes needs to see every recipe on disk,
 * including ones the current view would hide — but it enumerates pack sources from the same
 * registry and applies the same id precedence, so the agent sees the same library the user does.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { ListRecipesToolResult } from "@t3work/sdk";

import { mergeRecipesByPrecedence, PROJECT_LOCAL_ORIGIN } from "./t3work-projectRecipeOrigin.ts";
import { T3WORK_PROJECT_RECIPES_ROOT } from "./t3work-projectSetupShared.ts";
import { listRecipeAtPath, type MutableListResult } from "./t3work-recipeAgentListEntry.ts";
import { listPackRecipesForAgent } from "./t3work-recipeAgentListPack.ts";

/** Enumerate `<workspaceRoot>/.t3work/recipes/*`, appending each recipe directory to `out`. */
const listProjectLocalRecipes = Effect.fn("listProjectLocalRecipes")(function* (input: {
  readonly workspaceRoot: string;
  readonly out: MutableListResult;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const recipesRoot = pathService.join(input.workspaceRoot, T3WORK_PROJECT_RECIPES_ROOT);
  if (!(yield* fileSystem.exists(recipesRoot).pipe(Effect.orElseSucceed(() => false)))) {
    return;
  }
  for (const entry of yield* fileSystem.readDirectory(recipesRoot, { recursive: false })) {
    const recipePath = pathService.join(recipesRoot, entry);
    const entryStat = yield* fileSystem
      .stat(recipePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!entryStat || entryStat.type !== "Directory") {
      continue;
    }
    yield* listRecipeAtPath({ recipePath, origin: PROJECT_LOCAL_ORIGIN, out: input.out });
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
      recipes: [...merged.recipes].sort((left, right) => left.id.localeCompare(right.id)),
      errors: out.errors,
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
    } satisfies ListRecipesToolResult;
  },
);
