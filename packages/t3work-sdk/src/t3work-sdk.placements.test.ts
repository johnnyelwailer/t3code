/**
 * The SDK is the ONE public authoring import path for placement helpers (Epic 10 §Package
 * Boundaries / Epic 19 §Where helpers live in code). These tests pin that seam: each shipped
 * helper is reachable from `@t3work/sdk`'s index, accepts a well-formed definition, and rejects
 * a malformed one.
 */
import { describe, expect, it } from "vite-plus/test";

import { defineAction, defineSidecarSection } from "./t3work-sdk.index.ts";

describe("@t3work/sdk placement helpers", () => {
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
