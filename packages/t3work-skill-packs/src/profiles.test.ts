import { matchRecipes } from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { listBundledT3WorkRecipes } from "./recipes.js";
import {
  buildT3WorkProjectProfileManifest,
  cloneBundledT3WorkProfile,
  DEFAULT_T3WORK_PROFILE_ID,
  findDefaultPackProfile,
  getT3WorkProfile,
  listT3WorkProfiles,
  resolveEnabledSkillPackIds,
  resolveT3WorkProfile,
  resolveT3WorkProfileId,
  toRecipeProfileContext,
} from "./profiles.js";

describe("resolveT3WorkProfileId", () => {
  it("resolves canonical bundled profile ids", () => {
    expect(resolveT3WorkProfileId("engineering-copilot")).toBe("engineering-copilot");
    expect(resolveT3WorkProfileId("product-partner")).toBe("product-partner");
    expect(resolveT3WorkProfileId("qa-assistant")).toBe("qa-assistant");
  });

  it("lists bundled starter profiles with matcher-ready preference fields", () => {
    expect(listT3WorkProfiles()).toHaveLength(6);
    expect(toRecipeProfileContext(getT3WorkProfile("engineering-copilot"))).toMatchObject({
      technicalDepth: "high",
      guidanceStyle: "expert",
      detailDensity: "expert",
    });
  });
});

describe("resolveT3WorkProfile", () => {
  it("warns on unknown ids instead of silently using Product Partner", () => {
    const resolution = resolveT3WorkProfile({ profileId: "missing-profile" });
    expect(resolution.source).toBe("fallback");
    expect(resolution.warning).toContain("Unknown profile id 'missing-profile'");
  });
});

describe("custom profile recipe ranking", () => {
  it("ranks engineering recipes from preference fields without relying on bundled profile id", () => {
    const customProfile = cloneBundledT3WorkProfile("product-partner", "custom-eng-like", {
      communicationStyle: {
        technicalDepth: "high",
        brevity: "balanced",
        guidanceStyle: "expert",
      },
      preferredArtifactKinds: ["implementation-plan", "technical-checklist"],
      defaultActionFamilies: ["engineering", "release"],
      recommendedSkillPackIds: ["engineering", "release"],
      defaultRecipeWeights: { "technical-implementation-plan": 40 },
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

    const customResults = matchRecipes(listBundledT3WorkRecipes(), {
      ...matchInput,
      profile: toRecipeProfileContext(customProfile),
    });
    const baselineResults = matchRecipes(listBundledT3WorkRecipes(), {
      ...matchInput,
      profile: toRecipeProfileContext(getT3WorkProfile("product-partner")),
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

describe("pack default profile resolution", () => {
  const packProfile = (id: string, isDefault: boolean) => ({
    id,
    title: id,
    description: `${id} description`,
    audience: "engineering" as const,
    communicationStyle: {
      technicalDepth: "high" as const,
      brevity: "balanced" as const,
      guidanceStyle: "expert" as const,
    },
    preferredArtifactKinds: ["deployment-plan"],
    defaultRecipeWeights: {},
    recommendedSkillPackIds: ["engineering"],
    hideImplementationComplexity: false,
    ...(isDefault ? { default: true } : {}),
  });

  it("prefers a pack profile flagged default when nothing is stored", () => {
    const resolution = resolveT3WorkProfile({
      packProfiles: {
        "cloud-engineer": packProfile("cloud-engineer", false),
        "requirements-product": packProfile("requirements-product", true),
      },
    });
    expect(resolution.profile.id).toBe("requirements-product");
    expect(resolution.source).toBe("pack");
  });

  it("keeps an explicitly stored profile id ahead of the pack default", () => {
    const resolution = resolveT3WorkProfile({
      profileId: "cloud-engineer",
      packProfiles: {
        "cloud-engineer": packProfile("cloud-engineer", false),
        "requirements-product": packProfile("requirements-product", true),
      },
    });
    expect(resolution.profile.id).toBe("cloud-engineer");
    expect(resolution.source).toBe("pack");
    expect(resolveT3WorkProfile({ profileId: "qa-assistant" }).profile.id).toBe("qa-assistant");
  });

  it("keeps the bundled default when no pack profile claims default", () => {
    expect(resolveT3WorkProfile({}).profile.id).toBe(DEFAULT_T3WORK_PROFILE_ID);
    expect(
      resolveT3WorkProfile({
        packProfiles: { "cloud-engineer": packProfile("cloud-engineer", false) },
      }).profile.id,
    ).toBe(DEFAULT_T3WORK_PROFILE_ID);
  });

  it("picks the first registered pack default deterministically", () => {
    const resolution = resolveT3WorkProfile({
      packProfiles: {
        "first-default": packProfile("first-default", true),
        "second-default": packProfile("second-default", true),
      },
    });
    expect(resolution.profile.id).toBe("first-default");
    expect(findDefaultPackProfile(undefined)).toBeUndefined();
  });

  it("never persists the default flag into a project profile manifest", () => {
    const manifest = buildT3WorkProjectProfileManifest({
      profile: packProfile("requirements-product", true),
      enabledSkillPackIds: ["engineering"],
    });
    expect("default" in manifest).toBe(false);
  });
});
