import { matchRecipes } from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { listBundledT3TeamRecipes } from "./recipes.js";
import {
  cloneBundledT3TeamProfile,
  getT3TeamProfile,
  listT3TeamProfiles,
  resolveEnabledSkillPackIds,
  resolveT3TeamProfile,
  resolveT3TeamProfileId,
  toRecipeProfileContext,
} from "./profiles.js";

describe("resolveT3TeamProfileId", () => {
  it("resolves canonical bundled profile ids", () => {
    expect(resolveT3TeamProfileId("engineering-copilot")).toBe("engineering-copilot");
    expect(resolveT3TeamProfileId("product-partner")).toBe("product-partner");
    expect(resolveT3TeamProfileId("qa-assistant")).toBe("qa-assistant");
  });

  it("lists bundled starter profiles with matcher-ready preference fields", () => {
    expect(listT3TeamProfiles()).toHaveLength(6);
    expect(toRecipeProfileContext(getT3TeamProfile("engineering-copilot"))).toMatchObject({
      technicalDepth: "high",
      guidanceStyle: "expert",
      detailDensity: "expert",
    });
  });

  it("uses the shared topic section catalog for every bundled profile", () => {
    for (const profile of listT3TeamProfiles()) {
      expect(profile.sidecarSections?.sections.map((section) => section.sectionId)).toEqual([
        "filters",
        "quick-actions",
        "qa",
        "refinement",
        "planning",
        "engineering",
        "delivery",
        "customize",
        "recent",
      ]);
    }
  });
});

describe("resolveT3TeamProfile", () => {
  it("warns on unknown ids instead of silently using Product Partner", () => {
    const resolution = resolveT3TeamProfile({ profileId: "missing-profile" });
    expect(resolution.source).toBe("fallback");
    expect(resolution.warning).toContain("Unknown profile id 'missing-profile'");
  });
});

describe("custom profile recipe ranking", () => {
  it("ranks engineering recipes from preference fields without relying on bundled profile id", () => {
    const customProfile = cloneBundledT3TeamProfile("product-partner", "custom-eng-like", {
      communicationStyle: {
        technicalDepth: "high",
        brevity: "balanced",
        guidanceStyle: "expert",
      },
      preferredArtifactKinds: ["implementation-plan", "technical-checklist"],
      defaultActionFamilies: ["engineering", "release"],
      recommendedSkillPackIds: ["engineering", "release"],
      defaultRecipeWeights: { "review-acceptance-criteria": 40 },
    });

    const matchInput = {
      activeProject: { source: { provider: "atlassian" } },
      selectedResource: null,
      resourceKind: "ticket" as const,
      availableIntegrations: ["atlassian"],
      surface: "workitem.detail.sidepanel" as const,
      enabledSkillPacks: resolveEnabledSkillPackIds({ profile: customProfile }),
      availableContextKeys: [
        "ticket.summary",
        "project.summary",
        "ticket.context.pre-implementation",
      ],
    };

    const customResults = matchRecipes(listBundledT3TeamRecipes(), {
      ...matchInput,
      profile: toRecipeProfileContext(customProfile),
    });
    const baselineResults = matchRecipes(listBundledT3TeamRecipes(), {
      ...matchInput,
      profile: toRecipeProfileContext(getT3TeamProfile("product-partner")),
    });

    const customEngineeringIndex = customResults.findIndex((result) =>
      result.recipe.actionFamilies?.includes("engineering"),
    );
    const baselineEngineeringIndex = baselineResults.findIndex((result) =>
      result.recipe.actionFamilies?.includes("engineering"),
    );

    expect(customEngineeringIndex).toBeGreaterThanOrEqual(0);
    expect(customEngineeringIndex).toBeLessThan(baselineEngineeringIndex);
    expect(customProfile.id).toBe("custom-eng-like");
  });
});
