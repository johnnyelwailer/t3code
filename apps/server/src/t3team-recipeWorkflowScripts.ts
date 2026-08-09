/**
 * Resolve the launching recipe's private scripts for a workflow run (Epic 25 §Scripts).
 *
 * The `scripts.*` global tree is built per-workflow at launch from the launching recipe's
 * `defineRecipe({ scripts: { … } })` registration — there is no project-level or global script
 * tree. The discovery payload only carries `scriptNames` (serializable); the live ScriptRefs are
 * re-materialized HERE by re-importing the recipe's `recipe.ts` module through the same loader
 * discovery uses ({@link importRecipeModuleRef}), so launch and discovery cannot diverge on how
 * a recipe module is interpreted.
 *
 * Scope guard: the requested `workflowPath` must be one of the recipe's DECLARED action workflows
 * (`defaultAction` or a named entry in `actions`) — scripts are recipe-owned, so a launch pointing
 * at some other file must not inherit them.
 * Recipes without a `recipe.ts` (legacy `recipe.json`) resolve to an empty record: the engine
 * keeps its `scripts: {}` default and the body's `scripts.*` tree stays empty.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { AnyScriptRef } from "@t3team/sdk";

import { expandHomePath } from "./pathExpansion.ts";
import {
  resolveRecipeActions,
  resolveRecipeWorkflowPath,
} from "./t3team-projectRecipeActions.ts";
import { importRecipeModuleRef } from "./t3team-projectRecipeDiscoveryModule.ts";

/** The recipe module registered scripts but they cannot back this launch. */
export class T3TeamRecipeScriptResolutionError extends Data.TaggedError(
  "T3TeamRecipeScriptResolutionError",
)<{
  readonly message: string;
}> {}

export const NO_RECIPE_SCRIPTS: Readonly<Record<string, AnyScriptRef>> = Object.freeze({});

/**
 * Load the scripts the recipe at `recipePath` registers for the workflow at `workflowPath`.
 * Absent `recipePath`, absent `recipe.ts`, or a module without `scripts` → empty record
 * (the launch proceeds with the engine's `scripts: {}` default). A recipe module that HAS
 * scripts but fails to load or does not own `workflowPath` fails the launch loudly — silently
 * dropping registered scripts would surface later as an opaque `scripts.x is not a function`.
 */
export const resolveRecipeWorkflowScripts = Effect.fn("resolveRecipeWorkflowScripts")(
  function* (input: { readonly recipePath: string | undefined; readonly workflowPath: string }) {
    const recipePath = expandHomePath(input.recipePath?.trim() ?? "");
    if (recipePath.length === 0) return NO_RECIPE_SCRIPTS;
    // Workspace roots (and thus recipe/workflow launch paths derived from them) may legitimately
    // carry a literal `~` — expand it here, once, so this fs.exists/import and the ownership
    // compare below all operate on the real absolute path (see pathExpansion.ts).
    const workflowPath = expandHomePath(input.workflowPath);

    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const modulePath = pathService.join(recipePath, "recipe.ts");
    if (!(yield* fileSystem.exists(modulePath).pipe(Effect.orElseSucceed(() => false)))) {
      return NO_RECIPE_SCRIPTS;
    }

    const ref = yield* importRecipeModuleRef(modulePath).pipe(
      Effect.mapError(
        (error) =>
          new T3TeamRecipeScriptResolutionError({
            message: `Failed to load recipe module '${modulePath}' while resolving workflow scripts: ${
              error instanceof Error ? error.message : String(error)
            }`,
          }),
      ),
    );
    const scripts = ref.scripts;
    if (scripts === undefined || Object.keys(scripts).length === 0) return NO_RECIPE_SCRIPTS;

    // Ownership: scripts are scoped to the recipe that registers them. The default action is
    // resolved strictly (resolveWithinRoot-guarded, so an escaping `../` path fails here rather
    // than leaking scripts to an outside file); every NAMED action is resolved the same way and
    // joins the owned set, so launching any declared action of THIS recipe inherits its scripts.
    yield* Effect.try({
      try: () => resolveRecipeWorkflowPath(pathService, recipePath, ref),
      catch: (error) =>
        new T3TeamRecipeScriptResolutionError({
          message: `Recipe '${ref.id}' has an invalid defaultAction workflow path: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }),
    });
    const owned = resolveRecipeActions(pathService, recipePath, ref);
    if (!owned.some((action) => action.workflowPath === workflowPath)) {
      return yield* new T3TeamRecipeScriptResolutionError({
        message: `Recipe '${ref.id}' registers scripts for its declared actions (${owned
          .map((action) => `${action.name} -> ${action.workflowPath}`)
          .join(", ")}), but this launch targets '${workflowPath}'. Scripts are recipe-owned; launch one of the recipe's own actions to use them.`,
      });
    }
    return scripts;
  },
);
