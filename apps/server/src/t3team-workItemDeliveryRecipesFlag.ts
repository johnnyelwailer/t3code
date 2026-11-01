/**
 * Recipes discovery (launcher, agent list) and project setup leave out, read per call:
 * `fix-this-bug`/`implement-this` while `WORKITEM_DELIVERY_RECIPES` is off (they also need
 * `BUNDLED_RECIPE_EXAMPLES` to be scaffolded); non-pack copies of retired bundled ids and
 * `describe-rewrite` while `BUNDLED_RECIPE_EXAMPLES` is off. Files are never touched.
 */
import {
  readFeatureFlag,
  type ReadFeatureFlagEnv,
} from "@t3tools/project-context/t3teamFeatureFlags";

import {
  FEATURE_BACKING_BUNDLED_RECIPE_IDS,
  RETIRED_BUNDLED_RECIPE_IDS,
} from "@t3tools/t3team-skill-packs";

import {
  FIX_THIS_BUG_RECIPE_ID,
  IMPLEMENT_THIS_RECIPE_ID,
} from "./t3team-projectSetupWorkItemDeliveryRecipes.ts";

const WORK_ITEM_DELIVERY_RECIPE_IDS: ReadonlySet<string> = new Set([
  FIX_THIS_BUG_RECIPE_ID,
  IMPLEMENT_THIS_RECIPE_ID,
]);

function isDeliveryRecipeOffered(recipeId: string, readEnv?: ReadFeatureFlagEnv): boolean {
  return (
    !WORK_ITEM_DELIVERY_RECIPE_IDS.has(recipeId) ||
    readFeatureFlag("WORKITEM_DELIVERY_RECIPES", readEnv)
  );
}

/** The delivery filter alone: what project setup writes (its own list is already bundled-only). */
export function offeredRecipes<Recipe extends { readonly id: string }>(
  recipes: ReadonlyArray<Recipe>,
  readEnv?: ReadFeatureFlagEnv,
): ReadonlyArray<Recipe> {
  return recipes.filter((recipe) => isDeliveryRecipeOffered(recipe.id, readEnv));
}

function isRetiredCopyHidden(
  recipe: { readonly id: string; readonly source: string },
  readEnv?: ReadFeatureFlagEnv,
): boolean {
  return (
    recipe.source !== "pack" &&
    (RETIRED_BUNDLED_RECIPE_IDS.has(recipe.id) ||
      FEATURE_BACKING_BUNDLED_RECIPE_IDS.has(recipe.id)) &&
    !readFeatureFlag("BUNDLED_RECIPE_EXAMPLES", readEnv)
  );
}

/** What discovery (launcher and agent list) offers: the delivery filter plus the retired copies. */
export function offeredDiscoveredRecipes<
  Recipe extends { readonly id: string; readonly source: string },
>(recipes: ReadonlyArray<Recipe>, readEnv?: ReadFeatureFlagEnv): ReadonlyArray<Recipe> {
  return offeredRecipes(recipes, readEnv).filter((recipe) => !isRetiredCopyHidden(recipe, readEnv));
}
