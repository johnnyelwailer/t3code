import { describe, expect, it } from "vite-plus/test";

import type { SidecarComposition, SidecarPersonalization } from "@t3tools/project-recipes";

import {
  buildT3TeamSidecarItemResetLaunch,
  buildT3TeamSidecarSectionResetLaunch,
  T3TEAM_SIDECAR_APPLY_PERSONALIZATION_RESET_TOOL,
} from "~/t3team/t3team-sidecarPersonalizationReset";

const DEFAULT_COMPOSITION: SidecarComposition = {
  sections: [
    { sectionId: "quick-starts", visible: true, collapsed: false },
    { sectionId: "recent-conversations", visible: true, collapsed: false },
    { sectionId: "status", visible: true, collapsed: false },
  ],
};

describe("t3team-sidecarPersonalizationReset", () => {
  it("returns no section reset launch when the section has no user overrides", () => {
    expect(
      buildT3TeamSidecarSectionResetLaunch({
        surface: "project.dashboard.backlog",
        sectionId: "quick-starts",
        sectionTitle: "Quick Starts",
        defaultComposition: DEFAULT_COMPOSITION,
        personalization: {},
      }),
    ).toBeNull();
  });

  it("builds a section reset launch that clears only the target section overrides", () => {
    const personalization: SidecarPersonalization = {
      composition: {
        sections: [
          { sectionId: "recent-conversations", visible: true, collapsed: false },
          { sectionId: "quick-starts", visible: true, collapsed: true },
          { sectionId: "status", visible: false, collapsed: false },
        ],
      },
      itemHides: { "quick-starts": ["hidden-a", "hidden-b"], status: ["hidden-status"] },
      itemPins: { "quick-starts": ["pin-a"], status: ["pin-status"] },
      itemOrderOverrides: { "quick-starts": ["pin-a", "order-a"], status: ["order-status"] },
    };

    const launch = buildT3TeamSidecarSectionResetLaunch({
      surface: "project.dashboard.backlog",
      sectionId: "quick-starts",
      sectionTitle: "Quick Starts",
      defaultComposition: DEFAULT_COMPOSITION,
      personalization,
    });

    expect(launch?.title).toBe("Reset section");
    const toolStep = launch?.workflow.steps[2];
    expect(toolStep).toMatchObject({
      kind: "tool",
      toolName: T3TEAM_SIDECAR_APPLY_PERSONALIZATION_RESET_TOOL,
    });
    if (!toolStep || toolStep.kind !== "tool") {
      throw new Error("Expected a reset tool step.");
    }
    expect(toolStep.input).toEqual({
      nextPersonalization: {
        composition: {
          sections: [
            { sectionId: "quick-starts", visible: true, collapsed: false },
            { sectionId: "recent-conversations", visible: true, collapsed: false },
            { sectionId: "status", visible: false, collapsed: false },
          ],
        },
        itemHides: { status: ["hidden-status"] },
        itemPins: { status: ["pin-status"] },
        itemOrderOverrides: { status: ["order-status"] },
      },
      promptText: "Restored 7 customizations in Quick Starts.",
    });
  });

  it("builds an item reset launch that clears only the target item overrides", () => {
    const personalization: SidecarPersonalization = {
      composition: DEFAULT_COMPOSITION,
      itemHides: { "quick-starts": ["hidden-a"] },
      itemPins: { "quick-starts": ["recipe-a", "recipe-b"] },
      itemOrderOverrides: { "quick-starts": ["recipe-a", "recipe-c"] },
    };

    const launch = buildT3TeamSidecarItemResetLaunch({
      surface: "workitem.detail.sidepanel",
      sectionId: "quick-starts",
      itemId: "recipe-a",
      itemTitle: "Create a recipe for my work",
      personalization,
    });

    expect(launch?.title).toBe("Customize…");
    const toolStep = launch?.workflow.steps[2];
    if (!toolStep || toolStep.kind !== "tool") {
      throw new Error("Expected a reset tool step.");
    }
    expect(toolStep.input).toEqual({
      nextPersonalization: {
        composition: DEFAULT_COMPOSITION,
        itemHides: { "quick-starts": ["hidden-a"] },
        itemPins: { "quick-starts": ["recipe-b"] },
        itemOrderOverrides: { "quick-starts": ["recipe-c"] },
      },
      promptText: "Restored 2 customizations for Create a recipe for my work.",
    });
  });
});
