import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { UpdateManagedProjectRecipeRequest } from "@t3tools/project-recipes";

import {
  decodeRawProjectRecipeManifest,
  encodeRawProjectRecipeManifest,
  normalizeRecipeManifest,
  resolveWithinRoot,
  type RawProjectRecipeManifest,
} from "./t3work-projectRecipeDiscoveryShared.ts";
import {
  resolveManagedRecipePath,
  T3WORK_RECIPE_DISABLED_MARKER,
} from "./t3work-projectRecipeManagementPaths.ts";
import { readManagedProjectRecipeAtPath } from "./t3work-projectRecipeManagementRead.ts";

function hasMetadataUpdates(input: UpdateManagedProjectRecipeRequest): boolean {
  return (
    input.displayName !== undefined ||
    input.shortDescription !== undefined ||
    input.prompt !== undefined
  );
}

const readManifest = Effect.fn("readManifest")(function* (manifestPath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return normalizeRecipeManifest(
    (yield* fileSystem
      .readFileString(manifestPath)
      .pipe(Effect.flatMap(decodeRawProjectRecipeManifest))) as RawProjectRecipeManifest,
  );
});

export const updateManagedProjectRecipe = Effect.fn("updateManagedProjectRecipe")(function* (
  input: UpdateManagedProjectRecipeRequest,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const { workspaceRoot, recipePath } = yield* resolveManagedRecipePath(input);
  const markerPath = pathService.join(recipePath, T3WORK_RECIPE_DISABLED_MARKER);
  if (input.active === false) {
    const disabledAt = DateTime.formatIso(yield* DateTime.now);
    yield* fileSystem.writeFileString(markerPath, `{\n  "disabledAt": "${disabledAt}"\n}\n`);
  } else if (input.active === true) {
    yield* fileSystem.remove(markerPath, { force: true }).pipe(Effect.orElseSucceed(() => void 0));
  }

  if (hasMetadataUpdates(input)) {
    const manifestPath = pathService.join(recipePath, "recipe.json");
    if (!(yield* fileSystem.exists(manifestPath).pipe(Effect.orElseSucceed(() => false)))) {
      throw new Error("Only recipe.json recipes can be edited from the manager.");
    }
    const manifest = yield* readManifest(manifestPath);
    const nextManifest = {
      ...manifest,
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.shortDescription !== undefined
        ? { shortDescription: input.shortDescription.trim() }
        : {}),
    };
    if (!nextManifest.displayName || !nextManifest.shortDescription) {
      throw new Error("Recipe name and description are required.");
    }
    const encodedManifest = yield* encodeRawProjectRecipeManifest(nextManifest);
    yield* fileSystem.writeFileString(manifestPath, `${encodedManifest}\n`);
    if (input.prompt !== undefined) {
      const promptPath = resolveWithinRoot(pathService, recipePath, manifest.prompt);
      yield* fileSystem.writeFileString(promptPath, input.prompt);
    }
  }

  const recipe = yield* readManagedProjectRecipeAtPath(recipePath);
  return {
    workspaceRoot,
    recipe: Option.getOrThrowWith(recipe, () => new Error("Updated recipe could not be read.")),
  };
});

export const deleteManagedProjectRecipe = Effect.fn("deleteManagedProjectRecipe")(
  function* (input: { readonly workspaceRoot: string; readonly recipePath: string }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const { workspaceRoot, recipePath } = yield* resolveManagedRecipePath(input);
    yield* fileSystem.remove(recipePath, { recursive: true, force: true });
    return { workspaceRoot, deletedRecipePath: recipePath };
  },
);
