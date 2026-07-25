/**
 * Pack-provided recipe discovery (Epic 16 §Recipe Sources And Precedence).
 *
 * Deliberately thin: it maps registered pack recipe roots onto the SAME
 * `discoverProjectRecipeAtPath` used for `<workspaceRoot>/.t3team/recipes/*`, passing a pack
 * origin so the result carries `source: "pack"`. No second loader, no second surface filter, no
 * second `visible` evaluator — "the long-term goal is a single discovery path over a single
 * recipe type, regardless of source".
 *
 * Failure isolation matches project-local discovery: "A recipe whose module fails to load or whose
 * `visible`/metadata throws is dropped from the list — it never breaks the page or the other
 * recipes." Here the drop also produces a diagnostic naming the pack.
 */

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type { ProjectRecipeDiscovered, ProjectRecipeRenderContext } from "@t3tools/project-recipes";

import { getPackRecipeSources, type PackRecipeSource } from "./t3team-packRecipeSources.ts";
import { discoverProjectRecipeAtPath } from "./t3team-projectRecipeDiscoveryRecipe.ts";

/**
 * One-line rendering of a load failure. Walks to the INNERMOST `cause` first: `Effect.tryPromise`
 * wraps the real error in a generic wrapper, and the wrapper's message ("An error occurred in
 * Effect.tryPromise") is exactly the uninformative text that made this failure mode invisible.
 */
function describeLoadFailure(cause: Cause.Cause<unknown>): string {
  let error: unknown = Cause.squash(cause);
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const nested = (error as { readonly cause?: unknown }).cause;
    if (nested === undefined || nested === null) break;
    error = nested;
  }
  const message = (error as { readonly message?: unknown })?.message ?? error;
  return String(message).split("\n")[0] || "unknown error";
}

const discoverOne = Effect.fn("discoverPackRecipeAtSource")(function* (input: {
  readonly source: PackRecipeSource;
  readonly workspaceRoot: string;
  readonly context: ProjectRecipeRenderContext;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const { source } = input;
  if (!(yield* fileSystem.exists(source.recipeRoot).pipe(Effect.orElseSucceed(() => false)))) {
    return {
      recipe: Option.none<ProjectRecipeDiscovered>(),
      diagnostic: `Pack ${source.packId} recipe ${source.declaredId} is missing at ${source.recipeRoot}.`,
    };
  }

  const discovered = yield* discoverProjectRecipeAtPath({
    // Two different roots, deliberately:
    //  - `recipePath` is the pack's recipe directory, so the recipe's own relative `prompt` /
    //    `workflow` / `actionView` / `visible` files resolve inside the pack;
    //  - `workspaceRoot` stays the USER's workspace, because that is what a `visible.ts` gets as
    //    `workspace.rootPath` / `readText` / `exists` and what the read-only tool broker binds to.
    //    A pack recipe still decides its visibility from the user's project, not from the pack.
    workspaceRoot: input.workspaceRoot,
    recipePath: source.recipeRoot,
    context: input.context,
    origin: {
      source: "pack",
      packId: source.packId,
      packScope: source.packScope,
    },
  }).pipe(Effect.exit);

  // A recipe whose module fails to load stays isolated — it never breaks the page or the other
  // recipes — but the failure MUST be reported. Swallowing it makes a total library outage (e.g. the
  // pack's bare imports not resolving at all) indistinguishable from an ordinary empty recipe list.
  // Interruption is not a recipe defect, so it still propagates instead of becoming a diagnostic.
  if (Exit.isFailure(discovered)) {
    if (Cause.hasInterruptsOnly(discovered.cause)) {
      return yield* Effect.failCause(discovered.cause);
    }
    return {
      recipe: Option.none<ProjectRecipeDiscovered>(),
      diagnostic: `Pack ${source.packId} recipe ${source.declaredId} at ${source.recipeRoot} failed to load: ${describeLoadFailure(discovered.cause)}`,
    };
  }
  if (!Option.isSome(discovered.value)) {
    return { recipe: Option.none<ProjectRecipeDiscovered>() };
  }
  const recipe: ProjectRecipeDiscovered = discovered.value.value;
  if (recipe.id !== source.declaredId) {
    return {
      recipe: Option.none<ProjectRecipeDiscovered>(),
      diagnostic: `Pack ${source.packId} declares recipe id ${source.declaredId} but the recipe at ${source.recipeRoot} has id ${recipe.id}; it is ignored.`,
    };
  }
  return { recipe: Option.some(recipe) };
});

/** Discover every recipe contributed by an active pack, filtered by the same render context. */
export const discoverPackRecipes = Effect.fn("discoverPackRecipes")(function* (input: {
  readonly workspaceRoot: string;
  readonly context: ProjectRecipeRenderContext;
}) {
  const registered = getPackRecipeSources();
  const recipes: ProjectRecipeDiscovered[] = [];
  const diagnostics: string[] = [...registered.diagnostics];

  for (const source of registered.sources) {
    const result = yield* discoverOne({
      source,
      workspaceRoot: input.workspaceRoot,
      context: input.context,
    });
    if (result.diagnostic) diagnostics.push(result.diagnostic);
    if (Option.isSome(result.recipe)) recipes.push(result.recipe.value);
  }

  return { recipes, diagnostics };
});
