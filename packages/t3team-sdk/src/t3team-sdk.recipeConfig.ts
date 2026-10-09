/**
 * G12: a project's config for one recipe, `<state dir>/recipes/<recipeId>.config.ts`:
 *
 *   export default defineRecipeConfig<typeof PrWatch>("pr-watch", {
 *     defaults: { ownership: ownershipByJira },               // every linked repository
 *     scopes: [{ repos: ["hive/*"], autoMerge: ["pin-bump"] }], // matching ones, in file order
 *   });
 *
 * The settings are data: literals, lists, objects and references (an imported script, a
 * `defineWorkflow` ref, a `recipeAction`). The host checks that statically before it loads the
 * file, so a later settings UI can read and write it key by key. A run reads its resolved values
 * with `getConfig()` (t3team-sdk.recipeConfigPrimitive.ts).
 *
 * `with: { "<recipeId>": { … } }`, in `defaults` or a scope, is what this recipe passes to a
 * recipe it runs; that recipe applies it above its own config (`getConfig().for({ caller })`).
 */
import type { RecipeRef } from "./t3team-sdk.recipeTypes.ts";

/** A recipe action by id, resolved when the config loads through the pack → project precedence. */
export interface RecipeActionRef<_Recipe = unknown> {
  readonly kind: "recipe-action";
  readonly recipeId: string;
  readonly action?: string;
}

export function recipeAction<Recipe = unknown>(
  recipeId: string,
  action?: string,
): RecipeActionRef<Recipe> {
  return Object.freeze({
    kind: "recipe-action",
    recipeId,
    ...(action === undefined ? {} : { action }),
  });
}

type InputsOf<R> = R extends RecipeRef<infer Inputs, unknown> ? Inputs : R;

/** One layer of values: any subset of the recipe's inputs, plus what it passes on. */
export type RecipeConfigValues<R> = Partial<InputsOf<R>> & {
  readonly with?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
};

/** `owner/name` patterns with `*` globs, host-qualified (`host/owner/name`) when two hosts share one. */
export type RecipeConfigScope<R> = RecipeConfigValues<R> & {
  readonly repos: ReadonlyArray<string>;
};

export interface RecipeConfigSpec<R> {
  readonly defaults?: RecipeConfigValues<R>;
  readonly scopes?: ReadonlyArray<RecipeConfigScope<R>>;
}

export interface RecipeConfigRef<R = unknown> extends RecipeConfigSpec<R> {
  readonly kind: "recipe-config";
  readonly recipeId: string;
}

export function defineRecipeConfig<R = unknown>(
  recipeId: string,
  spec: RecipeConfigSpec<R>,
): RecipeConfigRef<R> {
  return Object.freeze({ kind: "recipe-config", recipeId, ...spec });
}

/** Where a resolved key's value came from, lowest to highest precedence. */
export type RecipeConfigSource =
  | { readonly layer: "recipe" }
  | { readonly layer: "defaults"; readonly line?: number }
  | { readonly layer: "scope"; readonly index: number; readonly line?: number }
  | { readonly layer: "caller" }
  | { readonly layer: "run" };

export interface RecipeConfigWarning {
  readonly key?: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
}

/** A recipe's config for one repository, as `getConfig().for(...)` returns it. */
export interface ResolvedRecipeConfig<Inputs = Record<string, unknown>> {
  readonly values: Partial<Inputs>;
  readonly sources: Readonly<Record<string, RecipeConfigSource>>;
  /** What this recipe passes to each recipe it runs, for this repository. */
  readonly with: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** The config file, when the project has one. */
  readonly file: string | null;
  readonly warnings: ReadonlyArray<RecipeConfigWarning>;
}
