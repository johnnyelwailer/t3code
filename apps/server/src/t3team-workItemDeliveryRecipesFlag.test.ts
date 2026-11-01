import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { renderBundledRecipeSetupFiles } from "./t3team-projectSetupRecipes.ts";
import { offeredRecipes } from "./t3team-workItemDeliveryRecipesFlag.ts";

const DELIVERY_RECIPE_DIRS = ["/fix-this-bug/", "/implement-this/"];

const scaffoldedDeliveryFiles = () =>
  renderBundledRecipeSetupFiles()
    .map((file) => file.relativePath)
    .filter((path) => DELIVERY_RECIPE_DIRS.some((dir) => path.includes(dir)));

describe("work-item delivery recipes behind WORKITEM_DELIVERY_RECIPES", () => {
  // The delivery recipes are bundled examples too, so the examples flag is on for both cases.
  beforeEach(() => replaceFeatureFlagPresetValues(new Map([["BUNDLED_RECIPE_EXAMPLES", true]])));
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it("are neither scaffolded nor listed while the flag is off (the default)", () => {
    expect(scaffoldedDeliveryFiles()).toEqual([]);
    expect(
      offeredRecipes([
        { id: "fix-this-bug" },
        { id: "implement-this" },
        { id: "describe-rewrite" },
      ]),
    ).toEqual([{ id: "describe-rewrite" }]);
  });

  it("are scaffolded and listed once the flag is on", () => {
    replaceFeatureFlagPresetValues(
      new Map([
        ["BUNDLED_RECIPE_EXAMPLES", true],
        ["WORKITEM_DELIVERY_RECIPES", true],
      ]),
    );
    expect(scaffoldedDeliveryFiles()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("fix-this-bug/recipe.ts"),
        expect.stringContaining("fix-this-bug/workflow.ts"),
        expect.stringContaining("implement-this/recipe.ts"),
        expect.stringContaining("implement-this/unit.workflow.ts"),
      ]),
    );
    expect(offeredRecipes([{ id: "fix-this-bug" }, { id: "implement-this" }])).toHaveLength(2);
  });
});
