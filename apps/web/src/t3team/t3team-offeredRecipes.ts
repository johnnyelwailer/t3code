/**
 * Which recipes the UI offers: none while `ORCHESTRATION_RECIPES` is off, and no work-item delivery
 * recipe while `WORKITEM_DELIVERY_RECIPES` is off. Both are live server flags, so the lists follow a
 * Settings → Features change without a reload.
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
