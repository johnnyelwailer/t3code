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

  it("allows values only from the SDK and the project's files, and no side-effect imports", () => {
    const result = checkRecipeConfigSource(
      "x.config.ts",
      lines(
        'import { defineRecipeConfig } from "@t3team/sdk";',
        'import type Other from "@t3team/recipes/other";',
        'import "./setup.ts";',
        'import { readFileSync } from "node:fs";',
        'import lodash from "lodash";',
        'export default defineRecipeConfig("x", {});',
      ),
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.line)).toEqual([3, 4, 5]);
    expect(result.diagnostics[0]?.message).toContain("side-effect");
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

  // Every argument of the export is evaluated on import, so none may go unchecked.
  it("rejects code smuggled in as a third argument", () => {
    const result = checkRecipeConfigSource(
      "x.config.ts",
      lines(
        'import { defineRecipeConfig } from "@t3team/sdk";',
        'export default defineRecipeConfig("x", {}, import("node:child_process"));',
      ),
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "defineRecipeConfig takes exactly two arguments: the recipe id and the object.",
    );
  });

  it("only trusts the SDK's own defineRecipeConfig, defineWorkflow and recipeAction", () => {
    const aliased = checkRecipeConfigSource(
      "x.config.ts",
      lines(
        'import { launchThread as defineWorkflow, defineRecipeConfig } from "@t3team/sdk";',
        'export default defineRecipeConfig("x", { defaults: { w: defineWorkflow("./w.ts") } });',
      ),
    );
    expect(aliased.diagnostics.length).toBeGreaterThan(0);
    const local = checkRecipeConfigSource(
      "x.config.ts",
      lines(
        'import { defineRecipeConfig } from "./not-the-sdk.ts";',
        'export default defineRecipeConfig("x", {});',
      ),
    );
    expect(local.diagnostics.length).toBeGreaterThan(0);
  });

  it("refuses file imports whose specifier a URL would resolve elsewhere", () => {
    for (const specifier of [
      "./%2e%2e/%2e%2e/outside.ts",
      "./a.ts?x=1",
      "./a.ts#x",
      "./\\u002e\\u002e/outside.ts",
      "./a\\b.ts",
    ]) {
      const result = checkRecipeConfigSource(
        "x.config.ts",
        lines(
          'import { defineRecipeConfig } from "@t3team/sdk";',
          `import policy from "${specifier}";`,
          'export default defineRecipeConfig("x", { defaults: { policy } });',
        ),
      );
      // The import is refused, so the setting that used it is unresolved too.
      expect(result.diagnostics.map((diagnostic) => diagnostic.line)).toEqual([2, 3]);
    }
  });
});
