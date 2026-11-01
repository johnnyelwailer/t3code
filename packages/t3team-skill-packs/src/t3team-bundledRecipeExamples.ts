/**
 * The bundled recipes in `recipes.ts` are examples, not product content: the product offers none of
 * them except the recipe-authoring entry, which is the only way a user can create a recipe. Recipes
 * the product offers come from packs and projects through discovery. The runtime flag
 * `BUNDLED_RECIPE_EXAMPLES` (Settings → Features, default off) offers the examples again.
 */
export const PRODUCT_BUNDLED_RECIPE_IDS: ReadonlySet<string> = new Set(["manage-project-recipes"]);

/** Never offered as a card, but a shipped control launches it from the project's scaffold: the
 * description `Rewrite` control stages `describe-rewrite` by path. Scaffolded, not offered. */
const FEATURE_BACKING_BUNDLED_RECIPE_IDS: ReadonlySet<string> = new Set(["describe-rewrite"]);

/** The one gate in front of every list of bundled recipes the product offers (quick starts, slash
 * aliases, digest catalog). */
export function offeredBundledRecipes<Recipe extends { readonly id: string }>(
  recipes: ReadonlyArray<Recipe>,
  examplesEnabled: boolean,
): ReadonlyArray<Recipe> {
  return examplesEnabled
    ? recipes
    : recipes.filter((recipe) => PRODUCT_BUNDLED_RECIPE_IDS.has(recipe.id));
}

/** What project setup writes into a project: what is offered, plus the recipes shipped controls need. */
export function scaffoldedBundledRecipes<Recipe extends { readonly id: string }>(
  recipes: ReadonlyArray<Recipe>,
  examplesEnabled: boolean,
): ReadonlyArray<Recipe> {
  return examplesEnabled
    ? recipes
    : recipes.filter(
        (recipe) =>
          PRODUCT_BUNDLED_RECIPE_IDS.has(recipe.id) ||
          FEATURE_BACKING_BUNDLED_RECIPE_IDS.has(recipe.id),
      );
}
