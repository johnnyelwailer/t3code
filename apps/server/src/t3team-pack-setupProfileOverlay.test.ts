import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { replaceFeatureFlagDatabaseValues } from "@t3tools/project-context/t3teamFeatureFlags";

import {
  DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID,
  resolveT3TeamProjectSetupProfile,
  resolveT3TeamProjectSetupProfileId,
} from "./t3team-projectSetupShared.ts";
import {
  getPackProfilesForResolver,
  getPackSetupProfileDescriptors,
  setPackSetupProfileOverlay,
} from "./t3team-pack-setupProfileOverlay.ts";

const profile = {
  id: "cloud-engineer",
  title: "Cloud Engineer",
  description: "Environment and deployment oversight.",
  badge: "Cloud",
  bullets: ["Track environment tasks", "Identify deployment risks"],
  category: "engineering" as const,
  iconDataUrl: "data:image/png;base64,AAAA",
  audience: "engineering" as const,
  communicationStyle: {
    technicalDepth: "high" as const,
    brevity: "balanced" as const,
    guidanceStyle: "expert" as const,
  },
  preferredArtifactKinds: ["deployment-plan"],
  recipeWeights: { "technical-implementation-plan": 30 },
  recommendedSkillPackIds: ["engineering"],
  hideImplementationComplexity: false,
  default: true,
};

describe("pack setup profile overlay", () => {
  // The pack's own `default` marker only survives while WORK_PROFILE_CHOOSER is on; with the
  // chooser off the default moves to the developer (engineering) profile, covered separately
  // below and in t3team-pack-setupProfileDefault.test.ts.
  beforeEach(() => replaceFeatureFlagDatabaseValues(new Map([["WORK_PROFILE_CHOOSER", true]])));
  afterEach(() => {
    setPackSetupProfileOverlay(undefined);
    replaceFeatureFlagDatabaseValues(new Map());
  });

  it("exposes only the presentation subset to the descriptor", () => {
    setPackSetupProfileOverlay([profile]);
    const descriptors = getPackSetupProfileDescriptors();
    expect(descriptors).toEqual([
      {
        id: "cloud-engineer",
        title: "Cloud Engineer",
        description: "Environment and deployment oversight.",
        badge: "Cloud",
        bullets: ["Track environment tasks", "Identify deployment risks"],
        category: "engineering",
        iconDataUrl: "data:image/png;base64,AAAA",
        default: true,
      },
    ]);
    // Behavior fields must not leak to the client payload.
    expect(JSON.stringify(descriptors)).not.toContain("recipeWeights");
  });

  it("resolves a selected pack profile with its behavior at project setup", () => {
    setPackSetupProfileOverlay([profile]);
    const forResolver = getPackProfilesForResolver();
    expect(forResolver?.["cloud-engineer"]?.defaultRecipeWeights).toEqual({
      "technical-implementation-plan": 30,
    });

    const resolution = resolveT3TeamProjectSetupProfile({ profileId: "cloud-engineer" });
    expect(resolution.source).toBe("pack");
    expect(resolution.profile.id).toBe("cloud-engineer");
    expect(resolution.profile.defaultRecipeWeights).toEqual({
      "technical-implementation-plan": 30,
    });
  });

  it("falls back to bundled profiles when no pack overlay is set", () => {
    expect(getPackSetupProfileDescriptors()).toBeUndefined();
    const resolution = resolveT3TeamProjectSetupProfile({ profileId: "product-partner" });
    expect(resolution.source).toBe("bundled");
  });

  it("keeps the default flag when mapping pack definitions for the resolver", () => {
    setPackSetupProfileOverlay([profile]);
    expect(getPackProfilesForResolver()?.["cloud-engineer"]?.default).toBe(true);
  });

  it("preselects the pack default when nothing is stored", () => {
    setPackSetupProfileOverlay([{ ...profile, id: "plain-role", default: false }, profile]);
    expect(resolveT3TeamProjectSetupProfileId(undefined)).toBe("cloud-engineer");
    const resolution = resolveT3TeamProjectSetupProfile({});
    expect(resolution.profile.id).toBe("cloud-engineer");
    expect(resolution.source).toBe("pack");
  });

  it("keeps a stored profile id ahead of the pack default", () => {
    setPackSetupProfileOverlay([{ ...profile, id: "plain-role", default: false }, profile]);
    expect(resolveT3TeamProjectSetupProfileId("plain-role")).toBe("plain-role");
    expect(resolveT3TeamProjectSetupProfileId("qa-assistant")).toBe("qa-assistant");
  });

  it("keeps the bundled default when the pack declares no default", () => {
    setPackSetupProfileOverlay([{ ...profile, default: false }]);
    expect(resolveT3TeamProjectSetupProfileId(undefined)).toBe(
      DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID,
    );
  });

  it("moves the default onto the developer profile while the chooser is off", () => {
    replaceFeatureFlagDatabaseValues(new Map([["WORK_PROFILE_CHOOSER", false]]));
    const product = { ...profile, id: "requirements-product", category: "product" as const };
    setPackSetupProfileOverlay([product, { ...profile, id: "engineer", default: false }]);

    expect(getPackSetupProfileDescriptors()?.map((entry) => [entry.id, entry.default])).toEqual([
      ["requirements-product", undefined],
      ["engineer", true],
    ]);
    expect(getPackProfilesForResolver()?.["requirements-product"]?.default).toBeUndefined();
    expect(getPackProfilesForResolver()?.["engineer"]?.default).toBe(true);
    // Nothing stored now resolves to the developer profile instead of the pack's own default.
    expect(resolveT3TeamProjectSetupProfileId(undefined)).toBe("engineer");

    // Flipping the flag back on is live — no restart, and the pack's declaration is intact.
    replaceFeatureFlagDatabaseValues(new Map([["WORK_PROFILE_CHOOSER", true]]));
    expect(resolveT3TeamProjectSetupProfileId(undefined)).toBe("requirements-product");
  });

  it("leaves the pack default alone with the chooser off and no engineering profile", () => {
    replaceFeatureFlagDatabaseValues(new Map([["WORK_PROFILE_CHOOSER", false]]));
    setPackSetupProfileOverlay([
      { ...profile, id: "requirements-product", category: "product" as const },
      { ...profile, id: "delivery", category: "delivery" as const, default: false },
    ]);
    expect(resolveT3TeamProjectSetupProfileId(undefined)).toBe("requirements-product");
  });
});
