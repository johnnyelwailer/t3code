import { describe, expect, it } from "vite-plus/test";

import { offeredBundledRecipes, scaffoldedBundledRecipes } from "./t3team-bundledRecipeExamples.ts";
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
});
