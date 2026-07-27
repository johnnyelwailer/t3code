/* oxlint-disable t3code/no-inline-schema-compile -- Mirrors sibling sidecarSection.test.ts. */
import { defineAction as defineActionFromSdk } from "@t3team/sdk/placements";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ActionDefinition, defineAction } from "./actionPlacement.ts";
import { defineAction as defineActionFromPlacements } from "./placements.ts";

const VIEW = `
export default function Action({ ctx }) {
  return <RecipeAction title="Summarize project risk" icon="triangle-alert" />;
}
`;

describe("defineAction", () => {
  it("returns a validated, frozen action-placement definition", () => {
    const definition = defineAction({
      id: "summarize-project-risk.action",
      version: "1.0.0",
      recipeId: "summarize-project-risk",
      surfaces: ["project.dashboard.backlog", "project.dashboard.myWork"],
      view: VIEW,
      rank: 30,
      shortDescription: "Recipe launcher card for the risk summary.",
    });

    expect(definition).toEqual({
      id: "summarize-project-risk.action",
      version: "1.0.0",
      recipeId: "summarize-project-risk",
      surfaces: ["project.dashboard.backlog", "project.dashboard.myWork"],
      view: VIEW,
      rank: 30,
      shortDescription: "Recipe launcher card for the risk summary.",
    });
    expect(Object.isFrozen(definition)).toBe(true);
    // Round-trips through the placement schema, so it is safe to ship in a pack manifest.
    expect(Schema.decodeSync(ActionDefinition)(JSON.parse(JSON.stringify(definition)))).toEqual(
      definition,
    );
  });

  it("is re-exported from the placements subpath the SDK surfaces", () => {
    expect(defineActionFromPlacements).toBe(defineAction);
  });

  // Direction check: the implementation is the SDK's (the public authoring surface); this package
  // only re-exports it, so the two must be the very same function.
  it("re-exports the SDK implementation rather than owning a second copy", () => {
    expect(defineAction).toBe(defineActionFromSdk);
  });

  it("rejects an unknown surface literal", () => {
    expect(() =>
      defineAction({
        id: "bad-surface.action",
        version: "1.0.0",
        recipeId: "summarize-project-risk",
        surfaces: ["project.dashboard.nope" as never],
        view: VIEW,
      }),
    ).toThrow();
  });

  it("rejects an empty surface list", () => {
    expect(() =>
      defineAction({
        id: "no-surface.action",
        version: "1.0.0",
        recipeId: "summarize-project-risk",
        surfaces: [],
        view: VIEW,
      }),
    ).toThrow(/declares no surfaces/);
  });

  it("rejects a view module without a default export", () => {
    expect(() =>
      defineAction({
        id: "no-default.action",
        version: "1.0.0",
        recipeId: "summarize-project-risk",
        surfaces: ["project.dashboard.backlog"],
        view: "function Action() { return null; }",
      }),
    ).toThrow(/default export/);
  });

  it("rejects a non-string view", () => {
    expect(() =>
      defineAction({
        id: "bad-view.action",
        version: "1.0.0",
        recipeId: "summarize-project-risk",
        surfaces: ["project.dashboard.backlog"],
        view: 42 as never,
      }),
    ).toThrow();
  });
});
