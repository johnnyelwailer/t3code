import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { T3WORK_PROJECT_RECIPES_ROOT } from "./t3work-projectSetupShared.ts";

export const T3WORK_RECIPE_DISABLED_MARKER = ".t3work-disabled.json";

function isInside(pathService: Path.Path, root: string, candidate: string): boolean {
  const relative = pathService.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith("..") && !pathService.isAbsolute(relative);
}

export const resolveManagedRecipePath = Effect.fn("resolveManagedRecipePath")(function* (input: {
  readonly workspaceRoot: string;
  readonly recipePath: string;
}) {
  const pathService = yield* Path.Path;
  const workspaceRoot = pathService.resolve(input.workspaceRoot);
  const recipesRoot = pathService.join(workspaceRoot, T3WORK_PROJECT_RECIPES_ROOT);
  const recipePath = pathService.resolve(input.recipePath);
  if (!isInside(pathService, recipesRoot, recipePath)) {
    throw new Error("Recipe path must be inside the project recipes directory.");
  }
  return { workspaceRoot, recipesRoot, recipePath };
});

export const listManagedRecipeDirectories = Effect.fn("listManagedRecipeDirectories")(function* (
  workspaceRootInput: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const workspaceRoot = pathService.resolve(workspaceRootInput);
  const recipesRoot = pathService.join(workspaceRoot, T3WORK_PROJECT_RECIPES_ROOT);
  if (!(yield* fileSystem.exists(recipesRoot).pipe(Effect.orElseSucceed(() => false)))) {
    return { workspaceRoot, recipesRoot, recipePaths: [] as string[] };
  }
  const entries = yield* fileSystem.readDirectory(recipesRoot, { recursive: false });
  const recipePaths: string[] = [];
  for (const entry of entries) {
    const recipePath = pathService.join(recipesRoot, entry);
    const stat = yield* fileSystem.stat(recipePath).pipe(Effect.catch(() => Effect.succeed(null)));
    if (stat?.type === "Directory") recipePaths.push(recipePath);
  }
  return { workspaceRoot, recipesRoot, recipePaths };
});
