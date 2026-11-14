/**
 * Which recipes the UI offers: none while `ORCHESTRATION_RECIPES` is off, no delivery recipe while
 * `WORKITEM_DELIVERY_RECIPES` is off (live server flags). Bundled examples are gated earlier, in
 * `t3team-sidecarRecipes.ts` (`BUNDLED_RECIPE_EXAMPLES`), so a delivery recipe needs both flags.
 */
import { WORK_ITEM_DELIVERY_RECIPE_IDS } from "~/t3team/t3team-bundledRecipeWorkflowIds";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

interface RecipeOfferFlags {
  readonly recipes: boolean;
  readonly deliveryRecipes: boolean;
}

const NONE: ReadonlyArray<never> = [];

export function offeredRecipes<Recipe extends { readonly id: string }>(
  recipes: ReadonlyArray<Recipe>,
  flags: RecipeOfferFlags,
): ReadonlyArray<Recipe> {
  if (!flags.recipes) return NONE;
  if (flags.deliveryRecipes) return recipes;
  return recipes.filter((recipe) => !WORK_ITEM_DELIVERY_RECIPE_IDS.has(recipe.id));
}

export function useOfferedRecipes<Recipe extends { readonly id: string }>(
  recipes: ReadonlyArray<Recipe>,
): ReadonlyArray<Recipe> {
  const recipesEnabled = useFeatureFlag("ORCHESTRATION_RECIPES");
  const deliveryRecipesEnabled = useFeatureFlag("WORKITEM_DELIVERY_RECIPES");
  return offeredRecipes(recipes, {
    recipes: recipesEnabled,
    deliveryRecipes: deliveryRecipesEnabled,
  });
}
