import { describe, expect, it } from "vite-plus/test";

import { packUiCompatibilityProblem, packWebImportProblem } from "./t3team-packs.webBoundary.ts";

const pack = { importer: "/dist/acme/web/index.ts", packDir: "/dist/acme" };
const story = { importer: "/dist/acme/web/card.stories.tsx", packDir: "/dist/acme" };

describe("packWebImportProblem", () => {
  it("allows react, effect, the pack-ui root and the pack's own files", () => {
    for (const source of [
      "react",
      "react/jsx-runtime",
      "react/compiler-runtime",
      "effect",
      "effect/Schema",
      "@t3team/pack-ui",
      "./card",
      "../store/collections.ts",
      "./card.css?inline",
      "/dist/acme/web/card.tsx",
    ]) {
      expect([source, packWebImportProblem(source, pack)]).toEqual([source, null]);
    }
  });

  it("refuses host aliases, host packages, pack-ui internals and paths outside the pack", () => {
    const refused: Array<[string, RegExp]> = [
      ["~/components/ui/button", /host app alias/],
      ["@/lib/utils", /host app alias/],
      ["~", /host app alias/],
      ["@t3tools/contracts", /not available to packs/],
      ["@t3team/pack-ui/contract", /not available to packs/],
      ["lucide-react", /not available to packs/],
      ["react-dom", /not available to packs/],
      ["effect-extra", /not available to packs/],
      ["../../apps/web/src/lib/utils", /outside the pack/],
      ["../../acme-other/web/index.ts", /outside the pack/],
      ["/repo/apps/web/src/main.tsx", /outside the pack/],
    ];
    for (const [source, problem] of refused) {
      expect(packWebImportProblem(source, pack)).toMatch(problem);
    }
  });

  it("lets stories, and only stories, import Storybook", () => {
    expect(packWebImportProblem("storybook/test", story)).toBeNull();
    expect(packWebImportProblem("@storybook/react-vite", story)).toBeNull();
    expect(packWebImportProblem("@storybook/react-vite", pack)).toMatch(/not available/);
  });

  it("leaves the imports the build itself injects alone", () => {
    for (const source of [
      "\0virtual:x",
      "/@react-refresh",
      "/@vite/client",
      "vite/preload-helper",
    ]) {
      expect(packWebImportProblem(source, pack)).toBeNull();
    }
  });
});

describe("packUiCompatibilityProblem", () => {
  it("accepts a version or an inclusive range that includes the host's", () => {
    expect(packUiCompatibilityProblem(["pack-ui:1"], 1)).toBeNull();
    expect(packUiCompatibilityProblem(["store:v1", "pack-ui:1-3"], 2)).toBeNull();
  });

  it("says what is wrong otherwise", () => {
    expect(packUiCompatibilityProblem(undefined, 1)).toMatch(/add "pack-ui:1"/);
    expect(packUiCompatibilityProblem(["pack-ui:2"], 1)).toMatch(
      /needs pack-ui:2, but this host provides pack-ui:1/,
    );
    expect(packUiCompatibilityProblem(["pack-ui:1-2"], 3)).toMatch(/provides pack-ui:3/);
    expect(packUiCompatibilityProblem(["pack-ui:^1"], 1)).toMatch(/not a pack-ui version/);
    expect(packUiCompatibilityProblem(["pack-ui:1", "pack-ui:2"], 1)).toMatch(/more than once/);
  });
});
