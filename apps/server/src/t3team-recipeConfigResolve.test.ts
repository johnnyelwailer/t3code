import { describe, expect, it } from "vite-plus/test";

import {
  type RecipeConfigLayers,
  repositoryMatches,
  resolveRecipeConfigLayers,
} from "./t3team-recipeConfigResolve.ts";

const hiveMerge = { kind: "workflow", absolutePath: "/repo/.nexi/policies/hive-merge.workflow.ts" };
const layers: RecipeConfigLayers = {
  file: "/repo/.nexi/recipes/pr-watch.config.ts",
  recipeDefaults: {
    foreignPrs: "report-only",
    duties: { fix: true, comments: true, review: true },
    autoMerge: [],
    mergePolicy: { kind: "recipe-action", recipeId: "pr-watch", action: "merge-policy" },
  },
  defaults: { model: "nexplore/conductor", with: { "pr-handle-comments": { language: "de" } } },
  scopes: [
    { repos: ["hive/*"], mergePolicy: hiveMerge, autoMerge: ["pin-bump"] },
    { repos: ["hive/nx-nexi"], autoMerge: ["docs"], duties: { fix: false } },
    {
      repos: ["nexplore.ghe.com/nexplore/ies-ng"],
      foreignPrs: "off",
      with: { "pr-handle-comments": { resolve: "never" } },
    },
  ],
  keyLines: { "defaults.model": 6, "scopes[0].mergePolicy": 8, "scopes[1].duties": 9 },
  warnings: [],
};

describe("recipe config precedence", () => {
  it("layers recipe defaults < config defaults < matching scopes in file order", () => {
    const resolved = resolveRecipeConfigLayers(layers, { repository: "hive/nx-nexi" });
    expect(resolved.values).toEqual({
      foreignPrs: "report-only",
      // Objects merge per field; a later scope overrides one field only.
      duties: { fix: false, comments: true, review: true },
      // Lists and references replace.
      autoMerge: ["docs"],
      mergePolicy: hiveMerge,
      model: "nexplore/conductor",
    });
    expect(resolved.sources).toEqual({
      foreignPrs: { layer: "recipe" },
      duties: { layer: "scope", index: 1, line: 9 },
      autoMerge: { layer: "scope", index: 1 },
      mergePolicy: { layer: "scope", index: 0, line: 8 },
      model: { layer: "defaults", line: 6 },
    });
    expect(resolved.with).toEqual({ "pr-handle-comments": { language: "de" } });
  });

  it("puts the caller's with-values and the run's own values on top", () => {
    const resolved = resolveRecipeConfigLayers(layers, {
      repository: "nexplore.ghe.com/nexplore/ies-ng",
      caller: { foreignPrs: "report-only", model: "claude/opus" },
      run: { model: "nexplore/deep" },
    });
    expect(resolved.values.foreignPrs).toBe("report-only");
    expect(resolved.sources.foreignPrs).toEqual({ layer: "caller" });
    expect(resolved.values.model).toBe("nexplore/deep");
    expect(resolved.sources.model).toEqual({ layer: "run" });
    expect(resolved.with).toEqual({
      "pr-handle-comments": { language: "de", resolve: "never" },
    });
  });

  it("applies no scope without a repository, and none that does not match", () => {
    expect(resolveRecipeConfigLayers(layers, {}).values.autoMerge).toEqual([]);
    expect(
      resolveRecipeConfigLayers(layers, { repository: "other/repo" }).values.mergePolicy,
    ).toEqual(layers.recipeDefaults.mergePolicy);
  });

  it("matches owner/name globs on any host, and host-qualified patterns on that host only", () => {
    expect(repositoryMatches("hive/*", "hive/nx-nexi")).toBe(true);
    expect(repositoryMatches("hive/*", "nexplore.ghe.com/hive/ops")).toBe(true);
    expect(repositoryMatches("hive/*", "hivemind/x")).toBe(false);
    expect(repositoryMatches("Hive/NX-*", "hive/nx-nexi")).toBe(true);
    expect(repositoryMatches("nexplore.ghe.com/hive/*", "github.com/hive/nx-nexi")).toBe(false);
    expect(repositoryMatches("nexplore.ghe.com/hive/*", "nexplore.ghe.com/hive/nx-nexi")).toBe(
      true,
    );
    expect(repositoryMatches("hive/nx.nexi", "hive/nxanexi")).toBe(false);
  });
});
