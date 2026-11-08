import { describe, expect, it } from "vite-plus/test";

import { offeredRecipes } from "./t3team-offeredRecipes";
import { digestVariantFlags } from "./t3team-digestVariantFlags";
import { DEFAULT_T3TEAM_BETA_FLAGS } from "./t3team-betaFlags";

const RECIPES = [{ id: "qa-test-plan" }, { id: "fix-this-bug" }, { id: "implement-this" }];

describe("recipes the UI offers", () => {
  it("offers every recipe while recipes and work-item recipes are on", () => {
    expect(offeredRecipes(RECIPES, { recipes: true, deliveryRecipes: true })).toEqual(RECIPES);
  });

  it("drops the work-item delivery recipes while WORKITEM_DELIVERY_RECIPES is off", () => {
    expect(offeredRecipes(RECIPES, { recipes: true, deliveryRecipes: false })).toEqual([
      { id: "qa-test-plan" },
    ]);
  });

  it("offers none while ORCHESTRATION_RECIPES is off", () => {
    expect(offeredRecipes(RECIPES, { recipes: false, deliveryRecipes: true })).toEqual([]);
  });
});

describe("digest variants behind MYWORK_DIGEST_VARIANTS", () => {
  const stored = { ...DEFAULT_T3TEAM_BETA_FLAGS, digestDefaultLens: "board" as const };

  it("applies the stored choices while on and the defaults while off", () => {
    expect(digestVariantFlags(stored, true).digestDefaultLens).toBe("board");
    expect(digestVariantFlags(stored, false)).toEqual(DEFAULT_T3TEAM_BETA_FLAGS);
  });
});
