/**
 * `WORKITEM_DELIVERY_RECIPES`: while off, project setup does not scaffold `fix-this-bug` and
 * `implement-this`, and recipe discovery (launcher and agent list) leaves them out, including copies
 * scaffolded earlier. Read on every call, so a Settings → Features change applies to the next list.
 */
import {
  readFeatureFlag,
  type ReadFeatureFlagEnv,
} from "@t3tools/project-context/t3teamFeatureFlags";

import {
  FIX_THIS_BUG_RECIPE_ID,
  IMPLEMENT_THIS_RECIPE_ID,
} from "./t3team-projectSetupWorkItemDeliveryRecipes.ts";

const WORK_ITEM_DELIVERY_RECIPE_IDS: ReadonlySet<string> = new Set([
  FIX_THIS_BUG_RECIPE_ID,
  IMPLEMENT_THIS_RECIPE_ID,
]);

function isRecipeOffered(recipeId: string, readEnv?: ReadFeatureFlagEnv): boolean {
  return (
    !WORK_ITEM_DELIVERY_RECIPE_IDS.has(recipeId) ||
    readFeatureFlag("WORKITEM_DELIVERY_RECIPES", readEnv)
  );
}

export function offeredRecipes<Recipe extends { readonly id: string }>(
  recipes: ReadonlyArray<Recipe>,
  readEnv?: ReadFeatureFlagEnv,
): ReadonlyArray<Recipe> {
  return recipes.filter((recipe) => isRecipeOffered(recipe.id, readEnv));
}
