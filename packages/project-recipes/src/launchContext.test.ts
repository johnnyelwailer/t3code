import { describe, expect, it } from "vite-plus/test";
import { createEmptyT3TeamActionRecipeContext } from "@t3tools/project-context";

import { RECIPE_LAUNCH_CONTEXT_ARG, buildRecipeLaunchArgs } from "./launchContext.ts";

const context = createEmptyT3TeamActionRecipeContext("github.pull_request.detail.sidepanel");

describe("buildRecipeLaunchArgs", () => {
  it("returns the parameters untouched when there is no launch context", () => {
    expect(buildRecipeLaunchArgs({ pr: "x" }, undefined)).toEqual({ pr: "x" });
    expect(buildRecipeLaunchArgs(undefined, undefined)).toEqual({});
  });

  it("adds the context under the reserved key beside the parameters", () => {
    const args = buildRecipeLaunchArgs({ pr: "x" }, context);
    expect(args).toEqual({ pr: "x", [RECIPE_LAUNCH_CONTEXT_ARG]: context });
    expect(RECIPE_LAUNCH_CONTEXT_ARG).toBe("__launchContext");
  });

  it("never lets a parameter spoof the reserved key", () => {
    expect(
      buildRecipeLaunchArgs({ [RECIPE_LAUNCH_CONTEXT_ARG]: { forged: true } }, undefined),
    ).toEqual({});
    expect(
      buildRecipeLaunchArgs({ [RECIPE_LAUNCH_CONTEXT_ARG]: { forged: true } }, context),
    ).toEqual({ [RECIPE_LAUNCH_CONTEXT_ARG]: context });
  });

  it("does not mutate the parameters", () => {
    const parameters = { pr: "x" };
    buildRecipeLaunchArgs(parameters, context);
    expect(parameters).toEqual({ pr: "x" });
  });
});
