/**
 * Re-resolve a rehydrated run's recipe-private `scripts.*` tree (Epic 25 §Scripts).
 *
 * Live launches materialize a recipe's ScriptRefs via {@link resolveRecipeWorkflowScripts}
 * and hand them to the engine; the refs are CODE and are never persisted. Boot rehydration
 * therefore re-resolves them from the run row's persisted `recipe_path` (migration 043)
 * before rebuilding the resume closure — otherwise a recipe-launched run that suspends,
 * survives a restart, and then calls `scripts.*` fails "not registered".
 *
 * Best-effort by design: a NULL `recipe_path` (ephemeral/scriptless/pre-043 run) resolves to
 * the empty record, and a resolution failure (recipe deleted or edited to disown the
 * workflow) logs a warning and ALSO resolves empty — the run rebuilds, and a later
 * `scripts.*` call surfaces the existing clear engine error instead of rehydration crashing
 * boot. FileSystem/Path are taken optionally from the environment so the rehydration
 * effect's requirements stay unchanged.
 */

import type { AnyScriptRef } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { NO_RECIPE_SCRIPTS, resolveRecipeWorkflowScripts } from "./t3team-recipeWorkflowScripts.ts";

export const resolveRehydratedWorkflowScripts = Effect.fn("resolveRehydratedWorkflowScripts")(
  function* (run: {
    readonly runId: string;
    readonly workflowPath: string;
    readonly recipePath: string | null;
  }) {
    if (run.recipePath === null) return NO_RECIPE_SCRIPTS;
    const fileSystem = Option.getOrUndefined(yield* Effect.serviceOption(FileSystem.FileSystem));
    const pathService = Option.getOrUndefined(yield* Effect.serviceOption(Path.Path));
    if (fileSystem === undefined || pathService === undefined) {
      yield* Effect.logWarning(
        "cannot re-resolve rehydrated workflow scripts without filesystem services",
        { runId: run.runId, recipePath: run.recipePath },
      );
      return NO_RECIPE_SCRIPTS;
    }
    return yield* resolveRecipeWorkflowScripts({
      recipePath: run.recipePath,
      workflowPath: run.workflowPath,
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, pathService),
      Effect.catch((error) =>
        Effect.logWarning("failed to re-resolve rehydrated workflow scripts; rebuilding without", {
          runId: run.runId,
          recipePath: run.recipePath,
          error: error instanceof Error ? error.message : String(error),
        }).pipe(Effect.as<Readonly<Record<string, AnyScriptRef>>>(NO_RECIPE_SCRIPTS)),
      ),
    );
  },
);
