import { describe, expect, it } from "vite-plus/test";

import {
  ensureProjectRecipeModuleResolution,
  isResolvableFromHost,
} from "./t3team-projectRecipeModuleResolution.ts";

/**
 * The end-to-end behaviour (a `recipe.ts` outside any install resolving `@t3team/sdk`) cannot be
 * exercised here: `vp test` runs through vite-plus, which owns module resolution in this
 * environment, so a Node `registerHooks` fallback never fires. What IS worth pinning is the
 * allow-list — it is a security boundary, not a convenience.
 */
describe("isResolvableFromHost", () => {
  it("allows the authoring SDK and its subpaths", () => {
    expect(isResolvableFromHost("@t3team/sdk")).toBe(true);
    expect(isResolvableFromHost("@t3team/sdk/placements")).toBe(true);
  });

  // A recipe's scripts/<name>.ts declares its schemas with `Schema` and is reached by a real
  // (non-type-only) import from recipe.ts, so `effect` has to resolve too.
  it("allows effect and its subpaths", () => {
    expect(isResolvableFromHost("effect")).toBe(true);
    expect(isResolvableFromHost("effect/Schema")).toBe(true);
  });

  it("refuses everything else, so a recipe cannot reach the host's dependency tree", () => {
    for (const specifier of [
      "@t3tools/contracts",
      "@t3tools/project-recipes",
      "node:fs",
      "express",
      "../../apps/server/src/secrets.ts",
      "@t3team/sdk-evil",
      "effect-evil",
      "",
    ]) {
      expect(isResolvableFromHost(specifier)).toBe(false);
    }
  });
});

describe("ensureProjectRecipeModuleResolution", () => {
  // Every recipe/workflow import path calls this; stacking duplicate resolve frames per import
  // would be a slow leak rather than a visible failure, so the idempotence is worth a test.
  it("is idempotent", () => {
    expect(() => {
      ensureProjectRecipeModuleResolution();
      ensureProjectRecipeModuleResolution();
      ensureProjectRecipeModuleResolution();
    }).not.toThrow();
  });
});
