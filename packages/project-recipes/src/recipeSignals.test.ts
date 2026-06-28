import { createQueryable } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectRecipeRenderContext } from "./discovery.js";
import { buildRecipeMatchSignalsFromRenderContext } from "./recipeSignals.js";

function createRenderContext(
  overrides: Partial<ProjectRecipeRenderContext> = {},
): ProjectRecipeRenderContext {
  return {
    surface: "workitem.detail.sidepanel",
    project: { title: "Alpha" },
    linkedResources: createQueryable([]),
    artifacts: createQueryable([]),
    profile: {
      technicalDepth: "medium",
      brevity: "balanced",
      guidanceStyle: "balanced",
      detailDensity: "balanced",
      preferredArtifactKinds: [],
      defaultActionFamilies: [],
      defaultRecipeWeights: {},
    },
    enabledSkillPacks: [],
    schema: {},
    availableContextKeys: createQueryable([]),
    ...overrides,
  };
}

describe("buildRecipeMatchSignalsFromRenderContext", () => {
  it("derives child relationship signals from workitem context", () => {
    const signals = buildRecipeMatchSignalsFromRenderContext(
      createRenderContext({
        workitem: {
          type: "Epic",
          displayId: "PROJ-1",
          relationships: {
            childKeys: ["PROJ-2"],
            referenceKeys: [],
            blockedByKeys: [],
            blockingKeys: [],
          },
        },
      }),
    );

    expect(signals).toMatchObject({
      "workitem.type": "Epic",
      "workitem.childCount": 1,
      "workitem.hasChildren": true,
      "surface.hasSelectedWork": true,
    });
  });

  it("omits child signals when relationships are unavailable", () => {
    const signals = buildRecipeMatchSignalsFromRenderContext(
      createRenderContext({
        workitem: {
          type: "Epic",
          displayId: "PROJ-1",
        },
      }),
    );

    expect(signals["workitem.hasChildren"]).toBeUndefined();
    expect(signals["workitem.childCount"]).toBeUndefined();
  });
});
