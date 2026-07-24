import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

/**
 * Alias format from docs/t3work-mvp/16-action-recipes.md#slashalias-semantics.
 * The leading `/` is implied by the trigger; aliases are stored without it.
 */
export const T3WORK_RECIPE_SLASH_ALIAS_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isT3workRecipeSlashAlias(value: string): boolean {
  return T3WORK_RECIPE_SLASH_ALIAS_PATTERN.test(value);
}

/**
 * Resolves the alias a recipe is reachable under: its explicit `slashAlias`,
 * otherwise its `id` when that is a valid alias. Recipes whose id is not a
 * valid alias (uppercase, dots, …) get no implicit alias and stay reachable
 * only through their Quick Starts card.
 */
export function resolveT3workRecipeSlashAlias(
  recipe: T3workSidecarRecipeQuickStart,
): string | null {
  const declared = recipe.slashAlias?.trim();
  if (declared) {
    return isT3workRecipeSlashAlias(declared) ? declared : null;
  }
  const implicit = recipe.id.trim();
  return isT3workRecipeSlashAlias(implicit) ? implicit : null;
}

export type T3workRecipeSlashAliasEntry = {
  readonly alias: string;
  readonly recipe: T3workSidecarRecipeQuickStart;
};

/**
 * Resolves the alias namespace for a recipe catalog.
 *
 * Precedence, per "Namespace and collision rules": host built-ins win, then
 * provider slash commands, then recipes in the order they were handed in
 * (already resolved precedence/rank order). A colliding later recipe loses its
 * alias — the recipe still loads and its Quick Starts card still works.
 */
export function resolveT3workRecipeSlashAliases(input: {
  readonly recipes: ReadonlyArray<T3workSidecarRecipeQuickStart>;
  readonly reservedAliases: ReadonlyArray<string>;
}): ReadonlyArray<T3workRecipeSlashAliasEntry> {
  const taken = new Set(input.reservedAliases.map((alias) => alias.toLowerCase()));
  const entries: T3workRecipeSlashAliasEntry[] = [];
  for (const recipe of input.recipes) {
    const alias = resolveT3workRecipeSlashAlias(recipe);
    if (!alias || taken.has(alias)) {
      continue;
    }
    taken.add(alias);
    entries.push({ alias, recipe });
  }
  return entries;
}
