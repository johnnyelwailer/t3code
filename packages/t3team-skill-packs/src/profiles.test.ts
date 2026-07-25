import { matchRecipes } from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { listBundledT3TeamRecipes } from "./recipes.js";
import {
  buildT3TeamProjectProfileManifest,
  cloneBundledT3TeamProfile,
  DEFAULT_T3TEAM_PROFILE_ID,
  findDefaultPackProfile,
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
    const resolution = resolveT3TeamProfile({
      packProfiles: {
        "cloud-engineer": packProfile("cloud-engineer", false),
        "requirements-product": packProfile("requirements-product", true),
      },
    });
    expect(resolution.profile.id).toBe("requirements-product");
    expect(resolution.source).toBe("pack");
  });

  it("keeps an explicitly stored profile id ahead of the pack default", () => {
    const resolution = resolveT3TeamProfile({
      profileId: "cloud-engineer",
      packProfiles: {
        "cloud-engineer": packProfile("cloud-engineer", false),
        "requirements-product": packProfile("requirements-product", true),
      },
    });
    expect(resolution.profile.id).toBe("cloud-engineer");
    expect(resolution.source).toBe("pack");
    expect(resolveT3TeamProfile({ profileId: "qa-assistant" }).profile.id).toBe("qa-assistant");
  });

  it("keeps the bundled default when no pack profile claims default", () => {
    expect(resolveT3TeamProfile({}).profile.id).toBe(DEFAULT_T3TEAM_PROFILE_ID);
    expect(
      resolveT3TeamProfile({
        packProfiles: { "cloud-engineer": packProfile("cloud-engineer", false) },
      }).profile.id,
    ).toBe(DEFAULT_T3TEAM_PROFILE_ID);
  });

  it("picks the first registered pack default deterministically", () => {
    const resolution = resolveT3TeamProfile({
      packProfiles: {
        "first-default": packProfile("first-default", true),
        "second-default": packProfile("second-default", true),
      },
    });
    expect(resolution.profile.id).toBe("first-default");
    expect(findDefaultPackProfile(undefined)).toBeUndefined();
  });

  it("never persists the default flag into a project profile manifest", () => {
    const manifest = buildT3TeamProjectProfileManifest({
      profile: packProfile("requirements-product", true),
      enabledSkillPackIds: ["engineering"],
    });
    expect("default" in manifest).toBe(false);
  });
});
