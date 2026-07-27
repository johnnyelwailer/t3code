/**
 * Resolve a recipe launch's `actionName` to the `.workflow.ts` the engine should run
 * (Epic 16 §Plugin Modules — one recipe, several actions).
 *
 * Why server-side: a named action is resolved by RE-IMPORTING the recipe module at `recipePath` and
 * reading its own `actions` map, never by trusting a path the caller sent. So an action name can
 * only ever select something the recipe itself declares — the same identity rule execution
 * authorization uses ({@link ./t3team-workflowRunPackAuthorize.ts}). No name (or `"default"`) keeps
 * the pre-actions behavior: the launch descriptor's `workflowPath`, i.e. `defaultAction`.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  DEFAULT_RECIPE_ACTION_NAME,
  resolveRecipeActionPath,
} from "./t3team-projectRecipeActions.ts";
import { importRecipeModuleRef } from "./t3team-projectRecipeDiscoveryModule.ts";

/** The launch named an action that cannot be resolved to one of the recipe's declared workflows. */
export class T3TeamRecipeActionResolutionError extends Data.TaggedError(
  "T3TeamRecipeActionResolutionError",
)<{
  readonly message: string;
}> {}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const resolveLaunchWorkflowPath = Effect.fn("resolveLaunchWorkflowPath")(function* (input: {
  /** The recipe directory the launch descriptor carries. */
  readonly recipePath: string | undefined;
  /** The descriptor's `workflowPath` — the default action, used when no action is named. */
  readonly workflowPath: string;
  readonly actionName: string | undefined;
}) {
  const actionName = input.actionName?.trim() ?? "";
  if (actionName.length === 0 || actionName === DEFAULT_RECIPE_ACTION_NAME) {
    return input.workflowPath;
  }

  const recipePath = input.recipePath?.trim() ?? "";
  if (recipePath.length === 0) {
    return yield* new T3TeamRecipeActionResolutionError({
      message: `launch.actionName '${actionName}' requires launch.recipePath: actions are resolved from the recipe's own module.`,
    });
  }

  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const modulePath = pathService.join(recipePath, "recipe.ts");
  if (!(yield* fileSystem.exists(modulePath).pipe(Effect.orElseSucceed(() => false)))) {
    return yield* new T3TeamRecipeActionResolutionError({
      message: `Recipe at '${recipePath}' has no recipe.ts, so it declares no named actions (requested '${actionName}').`,
    });
  }

  const ref = yield* importRecipeModuleRef(modulePath).pipe(
    Effect.mapError(
      (error) =>
        new T3TeamRecipeActionResolutionError({
          message: `Failed to load recipe module '${modulePath}' while resolving action '${actionName}': ${errorMessage(error)}`,
        }),
    ),
  );

  return yield* Effect.try({
    try: () => resolveRecipeActionPath({ pathService, recipePath, ref, actionName }),
    catch: (error) => new T3TeamRecipeActionResolutionError({ message: errorMessage(error) }),
  });
});
