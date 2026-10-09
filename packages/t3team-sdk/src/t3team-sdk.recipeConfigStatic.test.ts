import { describe, expect, it } from "vitest";

import { checkRecipeConfigSource } from "./t3team-sdk.recipeConfigStatic.ts";

const lines = (...rows: ReadonlyArray<string>) => rows.join("\n");

describe("recipe config data-only check", () => {
  it("accepts literals, lists, objects and references, and records each key's line", () => {
    const result = checkRecipeConfigSource(
      "pr-watch.config.ts",
      lines(
        'import { defineRecipeConfig, defineWorkflow, recipeAction } from "@t3team/sdk";',
        'import type PrWatch from "@t3team/recipes/pr-watch";',
        'import ownershipByJira from "../policies/ownership-by-jira.ts";',
        'const hiveMerge = defineWorkflow("../policies/hive-merge.workflow.ts");',
        'export default defineRecipeConfig<typeof PrWatch>("pr-watch", {',
        "  defaults: { ownership: ownershipByJira, duties: { fix: true }, fallbacks: [] },",
        "  scopes: [",
        '    { repos: ["hive/*"], mergePolicy: hiveMerge, autoMerge: ["pin-bump"], limit: -1 },',
        '    { repos: ["nexplore/ies-ng"], triage: recipeAction("ies-ci-triage"), with: { "pr-handle-comments": { language: "de" } } },',
        "  ],",
        "} as const);",
      ),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.recipeId).toBe("pr-watch");
    expect(result.keyLines).toMatchObject({
      "defaults.ownership": 6,
      "scopes[0].mergePolicy": 8,
      "scopes[1].with": 9,
    });
    expect(result.keyRefs).toEqual({ "defaults.ownership": "ownershipByJira" });
    expect(result.imports.ownershipByJira).toEqual({
      specifier: "../policies/ownership-by-jira.ts",
      name: "default",
    });
  });

  it("rejects computed values with the line they are on", () => {
    const result = checkRecipeConfigSource(
      "pr-watch.config.ts",
      lines(
        'import { defineRecipeConfig } from "@t3team/sdk";',
        "const n = 2 + 3;",
        'export default defineRecipeConfig("pr-watch", {',
        "  defaults: {",
        "    limit: n * 2,",
        "    pick: () => 'own',",
        "    labels: [...extra],",
        "    [dynamicKey]: true,",
        "    get model() { return 'x'; },",
        "    when: Date.now(),",
        "    unknown: somewhere,",
        "  },",
        "  extra: {},",
        "});",
        "console.log('side effect');",
      ),
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.line)).toEqual([
      2, 5, 6, 7, 8, 9, 10, 11, 13, 15,
    ]);
    expect(result.diagnostics[1]?.message).toContain("not data");
  });

  it("needs a default-exported defineRecipeConfig with a literal id", () => {
    expect(
      checkRecipeConfigSource("x.config.ts", "export const config = 1;").diagnostics.length,
    ).toBeGreaterThan(0);
    const noId = checkRecipeConfigSource(
      "x.config.ts",
      'import { defineRecipeConfig } from "@t3team/sdk";\nexport default defineRecipeConfig(id, {});',
    );
    expect(noId.recipeId).toBeNull();
    expect(noId.diagnostics[0]?.message).toContain("recipe id");
  });
});
