import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as NodeURL from "node:url";
import type { ManagedProjectRecipe, RecipeSurface } from "@t3tools/project-recipes";
import type { AnyRecipeRef } from "@t3work/sdk";

import {
  decodeRawProjectRecipeManifest,
  normalizeRecipeManifest,
  resolveWithinRoot,
  type RawProjectRecipeManifest,
} from "./t3work-projectRecipeDiscoveryShared.ts";
import {
  listManagedRecipeDirectories,
  T3WORK_RECIPE_DISABLED_MARKER,
} from "./t3work-projectRecipeManagementPaths.ts";

const readJsonRecipe = Effect.fn("readJsonRecipe")(function* (input: {
  readonly recipePath: string;
  readonly manifestPath: string;
  readonly active: boolean;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const manifest = normalizeRecipeManifest(
    (yield* fileSystem
      .readFileString(input.manifestPath)
      .pipe(Effect.flatMap(decodeRawProjectRecipeManifest))) as RawProjectRecipeManifest,
  );
  const promptPath = resolveWithinRoot(pathService, input.recipePath, manifest.prompt);
  const prompt = yield* fileSystem.readFileString(promptPath).pipe(Effect.orElseSucceed(() => ""));
  return {
    id: manifest.id,
    version: manifest.version,
    displayName: manifest.displayName,
    shortDescription: manifest.shortDescription,
    ...(manifest.topic ? { topic: manifest.topic } : {}),
    ...(manifest.icon ? { icon: manifest.icon } : {}),
    surfaces: manifest.surfaces,
    ...(manifest.rank !== undefined ? { rank: manifest.rank } : {}),
    active: input.active,
    sourceKind: "recipe-json",
    editable: true,
    deletable: true,
    recipePath: input.recipePath,
    sourcePath: input.manifestPath,
    promptPath,
    prompt,
    ...(manifest.workflow
      ? { workflowPath: resolveWithinRoot(pathService, input.recipePath, manifest.workflow) }
      : {}),
    ...(manifest.actionView
      ? { actionViewPath: resolveWithinRoot(pathService, input.recipePath, manifest.actionView) }
      : {}),
  } satisfies ManagedProjectRecipe;
});

const readModuleRecipe = Effect.fn("readModuleRecipe")(function* (input: {
  readonly recipePath: string;
  readonly modulePath: string;
  readonly active: boolean;
}) {
  const moduleUrl = NodeURL.pathToFileURL(input.modulePath);
  moduleUrl.searchParams.set("v", String(yield* Clock.currentTimeMillis));
  const imported = (yield* Effect.tryPromise(() => import(moduleUrl.toString()))) as {
    readonly default?: AnyRecipeRef;
  };
  const ref = imported.default;
  if (!ref || ref.kind !== "recipe") return Option.none<ManagedProjectRecipe>();
  return Option.some({
    id: ref.id,
    version: ref.version,
    displayName: ref.title,
    shortDescription: ref.shortDescription,
    ...(ref.icon ? { icon: ref.icon } : {}),
    surfaces: ref.surfaces as ReadonlyArray<RecipeSurface>,
    ...(ref.rank !== undefined ? { rank: ref.rank } : {}),
    active: input.active,
    sourceKind: "recipe-module",
    editable: false,
    deletable: true,
    recipePath: input.recipePath,
    sourcePath: input.modulePath,
    workflowPath: ref.defaultAction.absolutePath,
  } satisfies ManagedProjectRecipe);
});

export const readManagedProjectRecipeAtPath = Effect.fn("readManagedProjectRecipeAtPath")(
  function* (recipePath: string) {
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const markerPath = pathService.join(recipePath, T3WORK_RECIPE_DISABLED_MARKER);
    const active = !(yield* fileSystem.exists(markerPath).pipe(Effect.orElseSucceed(() => false)));
    const modulePath = pathService.join(recipePath, "recipe.ts");
    if (yield* fileSystem.exists(modulePath).pipe(Effect.orElseSucceed(() => false))) {
      return yield* readModuleRecipe({ recipePath, modulePath, active });
    }
    const manifestPath = pathService.join(recipePath, "recipe.json");
    if (!(yield* fileSystem.exists(manifestPath).pipe(Effect.orElseSucceed(() => false)))) {
      return Option.none<ManagedProjectRecipe>();
    }
    return Option.some(yield* readJsonRecipe({ recipePath, manifestPath, active }));
  },
);

export const listManagedProjectRecipes = Effect.fn("listManagedProjectRecipes")(function* (
  workspaceRootInput: string,
) {
  const { workspaceRoot, recipePaths } = yield* listManagedRecipeDirectories(workspaceRootInput);
  const recipes: ManagedProjectRecipe[] = [];
  for (const recipePath of recipePaths) {
    const recipe = yield* readManagedProjectRecipeAtPath(recipePath).pipe(
      Effect.catch(() => Effect.succeed(Option.none<ManagedProjectRecipe>())),
    );
    if (Option.isSome(recipe)) recipes.push(recipe.value);
  }
  return {
    workspaceRoot,
    hasProjectLocalRecipes: recipes.length > 0,
    recipes: recipes.toSorted((left, right) => left.displayName.localeCompare(right.displayName)),
  };
});
