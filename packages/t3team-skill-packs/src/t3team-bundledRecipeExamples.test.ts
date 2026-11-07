import { describe, expect, it } from "vite-plus/test";

import {
  offeredBundledRecipes,
  PRODUCT_BUNDLED_RECIPE_IDS,
  RETIRED_BUNDLED_RECIPE_IDS,
  scaffoldedBundledRecipes,
} from "./t3team-bundledRecipeExamples.ts";
import { listBundledT3TeamRecipes } from "./recipes.ts";

const ids = (recipes: ReadonlyArray<{ readonly id: string }>) => recipes.map((recipe) => recipe.id);

describe("bundled recipe examples", () => {
  const all = listBundledT3TeamRecipes();

  it("offers only the recipe-authoring entry while the examples flag is off", () => {
    expect(ids(offeredBundledRecipes(all, false))).toEqual(["manage-project-recipes"]);
  });

  it("offers every bundled recipe once the examples flag is on", () => {
    expect(offeredBundledRecipes(all, true)).toBe(all);
  });

  it("scaffolds the authoring entry and the recipe the Rewrite control launches while off", () => {
    expect(ids(scaffoldedBundledRecipes(all, false)).toSorted()).toEqual([
      "describe-rewrite",
      "manage-project-recipes",
    ]);
    expect(scaffoldedBundledRecipes(all, true)).toBe(all);
  });

  it("retires exactly the bundled recipes that are neither offered nor scaffolded for a control", () => {
    const bundledIds = new Set(ids(all));
    const kept = new Set([
      ...ids(offeredBundledRecipes(all, false)),
      ...ids(scaffoldedBundledRecipes(all, false)),
    ]);
    expect(RETIRED_BUNDLED_RECIPE_IDS.size).toBe(22);
    // Every retired id is a real bundled id, and no kept id is retired: a retired id is hidden in
    // discovery, so a recipe that is offered must never be on the list.
    for (const id of RETIRED_BUNDLED_RECIPE_IDS) expect(bundledIds.has(id)).toBe(true);
    for (const id of kept) expect(RETIRED_BUNDLED_RECIPE_IDS.has(id)).toBe(false);
    for (const id of PRODUCT_BUNDLED_RECIPE_IDS)
      expect(RETIRED_BUNDLED_RECIPE_IDS.has(id)).toBe(false);
    expect(new Set([...RETIRED_BUNDLED_RECIPE_IDS, ...kept])).toEqual(bundledIds);
  });
});
