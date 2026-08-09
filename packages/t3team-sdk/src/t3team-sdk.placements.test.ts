/**
 * The SDK is the ONE public authoring import path for placement helpers (Epic 10 §Package
 * Boundaries / Epic 19 §Where helpers live in code). These tests pin that seam: each shipped
 * helper is reachable from `@t3team/sdk`'s index, accepts a well-formed definition, and rejects
 * a malformed one.
 */
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { defineAction, defineSidecarSection } from "./t3team-sdk.index.ts";

const PLACEMENT_MODULES = [
  "./t3team-sdk.placements.ts",
  "./t3team-sdk.actionPlacement.ts",
  "./t3team-sdk.sidecarSection.ts",
  "./t3team-sdk.surface.ts",
];

describe("@t3team/sdk placement helpers", () => {
  // The SDK is the LOWER layer: project-recipes re-exports from it, never the reverse. A
  // deep-import back into @t3tools/project-recipes is what forced every SDK consumer to resolve
  // project-recipes too (and needed an extra symlink in the private distro).
  it("owns the placement implementations without importing project-recipes", () => {
    for (const specifier of PLACEMENT_MODULES) {
      const source = NodeFS.readFileSync(
        NodeURL.fileURLToPath(new URL(specifier, import.meta.url)),
        "utf8",
      );
      const imports = [...source.matchAll(/^\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gm)].map(
        (match) => match[1],
      );
      expect(imports, `${specifier} imports`).not.toContain("@t3tools/project-recipes");
      expect(imports.filter((from) => from.startsWith("@t3tools/"))).toEqual([]);
    }
  });

  describe("defineSidecarSection", () => {
    it("accepts a well-formed sidecar.section contribution", () => {
      expect(
        defineSidecarSection({
          id: "quick-starts",
          version: "1.0.0",
          title: "Quick starts",
          surfaces: ["project.dashboard.backlog"],
          component: "quick-starts",
        }),
      ).toMatchObject({ id: "quick-starts", component: "quick-starts" });
    });

    it("rejects a malformed sidecar.section contribution", () => {
      expect(() =>
        defineSidecarSection({
          id: "quick-starts",
          version: "1.0.0",
          title: "Quick starts",
          surfaces: ["project.dashboard.nope" as never],
          component: "quick-starts",
        }),
      ).toThrow();
    });
  });

  describe("defineAction", () => {
    it("accepts a well-formed action contribution", () => {
      expect(
        defineAction({
          id: "explain-selected-work.action",
          version: "1.0.0",
          recipeId: "explain-selected-work",
          surfaces: ["workitem.detail.sidepanel"],
          view: "export default function Action() { return null; }",
        }),
      ).toMatchObject({ recipeId: "explain-selected-work" });
    });

    it("rejects a malformed action contribution", () => {
      expect(() =>
        defineAction({
          id: "explain-selected-work.action",
          version: "1.0.0",
          recipeId: "explain-selected-work",
          surfaces: ["workitem.detail.sidepanel"],
          view: "function Action() { return null; }",
        }),
      ).toThrow(/default export/);
    });
  });
});
