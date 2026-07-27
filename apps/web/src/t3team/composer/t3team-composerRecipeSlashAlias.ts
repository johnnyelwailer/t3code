import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

/**
 * Alias format from docs/t3team-mvp/16-action-recipes.md#slashalias-semantics.
 * The leading `/` is implied by the trigger; aliases are stored without it.
 */
export const T3TEAM_RECIPE_SLASH_ALIAS_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isT3TeamRecipeSlashAlias(value: string): boolean {
  return T3TEAM_RECIPE_SLASH_ALIAS_PATTERN.test(value);
}

/**
 * Resolves the alias a recipe is reachable under: its explicit `slashAlias`,
 * otherwise its `id` when that is a valid alias. Recipes whose id is not a
 * valid alias (uppercase, dots, …) get no implicit alias and stay reachable
 * only through their Quick Starts card.
 */
export function resolveT3TeamRecipeSlashAlias(
  recipe: T3TeamSidecarRecipeQuickStart,
): string | null {
  const declared = recipe.slashAlias?.trim();
  if (declared) {
    return isT3TeamRecipeSlashAlias(declared) ? declared : null;
  }
  const implicit = recipe.id.trim();
  return isT3TeamRecipeSlashAlias(implicit) ? implicit : null;
}

export type T3TeamRecipeSlashAliasEntry = {
  readonly alias: string;
  readonly recipe: T3TeamSidecarRecipeQuickStart;
};

/**
 * Resolves the alias namespace for a recipe catalog.
 *
 * Precedence, per "Namespace and collision rules": host built-ins win, then
 * provider slash commands, then recipes in the order they were handed in
 * (already resolved precedence/rank order). A colliding later recipe loses its
 * alias — the recipe still loads and its Quick Starts card still works.
 */
export function resolveT3TeamRecipeSlashAliases(input: {
  readonly recipes: ReadonlyArray<T3TeamSidecarRecipeQuickStart>;
  readonly reservedAliases: ReadonlyArray<string>;
}): ReadonlyArray<T3TeamRecipeSlashAliasEntry> {
  const taken = new Set(input.reservedAliases.map((alias) => alias.toLowerCase()));
  const entries: T3TeamRecipeSlashAliasEntry[] = [];
  for (const recipe of input.recipes) {
    const alias = resolveT3TeamRecipeSlashAlias(recipe);
    if (!alias || taken.has(alias)) {
      continue;
    }
    taken.add(alias);
    entries.push({ alias, recipe });
  }
  return entries;
}
