/**
 * Loading ONE recipe directory into a `RecipeListEntry` for the agent-facing
 * `t3work.recipe.list`, regardless of whether the directory lives in the project's
 * `.t3work/recipes/*` or inside a pack (Epic 16 §Recipe Sources And Precedence).
 *
 * Extracted from {@link ./t3work-recipeAgentList.ts} so project-local and pack enumeration share
 * one loader — the same rule pack discovery follows for the UI path: "no second loader".
 * Deliberately no surface/visibility filtering: an agent editing or running recipes needs to see
 * every recipe on disk, including ones the current view would hide.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { RecipeListEntry, RecipeToolIssue } from "@t3work/sdk";

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
import { originFields, type ProjectRecipeOrigin } from "./t3work-projectRecipeOrigin.ts";

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export type MutableListResult = {
  recipes: RecipeListEntry[];
  errors: RecipeToolIssue[];
  diagnostics: string[];
};

type LoadInput = {
  readonly recipePath: string;
  readonly origin: ProjectRecipeOrigin;
  readonly out: MutableListResult;
};

const listTypedRecipe = Effect.fn("listTypedRecipe")(function* (
  input: LoadInput & { readonly modulePath: string },
) {
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
    ...originFields(input.origin),
  });
});

const listLegacyRecipe = Effect.fn("listLegacyRecipe")(function* (
  input: LoadInput & { readonly manifestPath: string },
) {
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
    ...originFields(input.origin),
  });
});

/**
 * Append the recipe at `recipePath` to `out`, typed `recipe.ts` taking precedence over a legacy
 * `recipe.json`. Returns whether the directory held a recipe at all, which is what the callers use
 * to distinguish "no recipe here" from "a recipe that failed to load".
 */
export const listRecipeAtPath = Effect.fn("listRecipeAtPath")(function* (input: LoadInput) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const modulePath = pathService.join(input.recipePath, "recipe.ts");
  if (yield* fileSystem.exists(modulePath).pipe(Effect.orElseSucceed(() => false))) {
    yield* listTypedRecipe({ ...input, modulePath });
    return true;
  }
  const manifestPath = pathService.join(input.recipePath, "recipe.json");
  if (yield* fileSystem.exists(manifestPath).pipe(Effect.orElseSucceed(() => false))) {
    yield* listLegacyRecipe({ ...input, manifestPath });
    return true;
  }
  return false;
});
