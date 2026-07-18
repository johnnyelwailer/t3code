/**
 * `t3work.recipe.list` implementation: an authoring-oriented, read-only inventory of the
 * project's `.t3work/recipes/*` directories. Unlike UI discovery
 * ({@link ./t3work-projectRecipeDiscovery.ts}) it does NOT filter by surface or visibility —
 * an agent editing recipes needs to see every recipe on disk, including ones the current view
 * would hide — but it loads each recipe through the same shared building blocks (typed
 * `recipe.ts` module import, legacy `recipe.json` manifest decode).
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { ListRecipesToolResult, RecipeListEntry, RecipeToolIssue } from "@t3work/sdk";

import {
  importRecipeModuleRef,
  resolveRecipeWorkflowPath,
} from "./t3work-projectRecipeDiscoveryModule.ts";
import {
  decodeRawProjectRecipeManifest,
  normalizeRecipeManifest,
  resolveWithinRoot,
  type RawProjectRecipeManifest,
} from "./t3work-projectRecipeDiscoveryShared.ts";
import { T3WORK_PROJECT_RECIPES_ROOT } from "./t3work-projectSetupShared.ts";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

type MutableListResult = {
  recipes: RecipeListEntry[];
  errors: RecipeToolIssue[];
};

const listTypedRecipe = Effect.fn("listTypedRecipe")(function* (input: {
  readonly recipePath: string;
  readonly modulePath: string;
  readonly out: MutableListResult;
}) {
  const pathService = yield* Path.Path;
  const loaded = yield* importRecipeModuleRef(input.modulePath).pipe(Effect.result);
  if (loaded._tag === "Failure") {
    input.out.errors.push({
      path: input.modulePath,
      phase: "load",
      message: errorMessage(loaded.failure),
    });
    return;
  }
  const ref = loaded.success;
  let workflowPath: string | undefined;
  try {
    workflowPath = resolveRecipeWorkflowPath(pathService, input.recipePath, ref);
  } catch (error) {
    input.out.errors.push({
      path: input.modulePath,
      phase: "discover",
      message: errorMessage(error),
    });
  }
  input.out.recipes.push({
    id: ref.id,
    title: ref.title,
    shortDescription: ref.shortDescription,
    surfaces: [...ref.surfaces],
    authoring: "recipe-ts",
    recipePath: input.recipePath,
    ...(workflowPath === undefined ? {} : { workflowPath }),
  });
});

const listLegacyRecipe = Effect.fn("listLegacyRecipe")(function* (input: {
  readonly recipePath: string;
  readonly manifestPath: string;
  readonly out: MutableListResult;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const decoded = yield* fileSystem.readFileString(input.manifestPath).pipe(
    Effect.flatMap(decodeRawProjectRecipeManifest),
    Effect.flatMap((raw) =>
      Effect.try({
        try: () => normalizeRecipeManifest(raw as RawProjectRecipeManifest),
        catch: (error) => errorMessage(error),
      }),
    ),
    Effect.result,
  );
  if (decoded._tag === "Failure") {
    input.out.errors.push({
      path: input.manifestPath,
      phase: "load",
      message: errorMessage(decoded.failure),
    });
    return;
  }
  const manifest = decoded.success;
  let workflowPath: string | undefined;
  if (typeof manifest.workflow === "string" && manifest.workflow.trim().length > 0) {
    try {
      workflowPath = resolveWithinRoot(pathService, input.recipePath, manifest.workflow);
    } catch (error) {
      input.out.errors.push({
        path: input.manifestPath,
        phase: "discover",
        message: errorMessage(error),
      });
    }
  }
  input.out.recipes.push({
    id: manifest.id,
    title: manifest.displayName,
    shortDescription: manifest.shortDescription,
    surfaces: [...manifest.surfaces],
    authoring: "recipe-json",
    recipePath: input.recipePath,
    ...(workflowPath === undefined ? {} : { workflowPath }),
  });
});

/** List every project-local recipe on disk, with structured per-recipe load errors. */
export const listProjectRecipesForAgent = Effect.fn("listProjectRecipesForAgent")(
  function* (input: { readonly workspaceRoot: string }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const workspaceRoot = pathService.resolve(input.workspaceRoot);
    const recipesRoot = pathService.join(workspaceRoot, T3WORK_PROJECT_RECIPES_ROOT);
    const out: MutableListResult = { recipes: [], errors: [] };

    if (yield* fileSystem.exists(recipesRoot).pipe(Effect.orElseSucceed(() => false))) {
      for (const entry of yield* fileSystem.readDirectory(recipesRoot, { recursive: false })) {
        const recipePath = pathService.join(recipesRoot, entry);
        const entryStat = yield* fileSystem
          .stat(recipePath)
          .pipe(Effect.catch(() => Effect.succeed(null)));
        if (!entryStat || entryStat.type !== "Directory") {
          continue;
        }
        const modulePath = pathService.join(recipePath, "recipe.ts");
        if (yield* fileSystem.exists(modulePath).pipe(Effect.orElseSucceed(() => false))) {
          yield* listTypedRecipe({ recipePath, modulePath, out });
          continue;
        }
        const manifestPath = pathService.join(recipePath, "recipe.json");
        if (yield* fileSystem.exists(manifestPath).pipe(Effect.orElseSucceed(() => false))) {
          yield* listLegacyRecipe({ recipePath, manifestPath, out });
        }
      }
    }

    out.recipes.sort((left, right) => left.id.localeCompare(right.id));
    return {
      ok: true as const,
      workspaceRoot,
      recipes: out.recipes,
      errors: out.errors,
    } satisfies ListRecipesToolResult;
  },
);
