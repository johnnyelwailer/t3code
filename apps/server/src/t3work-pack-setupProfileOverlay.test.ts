import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID,
  resolveT3WorkProjectSetupProfile,
  resolveT3WorkProjectSetupProfileId,
} from "./t3work-projectSetupShared.ts";
import {
  getPackProfilesForResolver,
  getPackSetupProfileDescriptors,
  setPackSetupProfileOverlay,
} from "./t3work-pack-setupProfileOverlay.ts";

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
  afterEach(() => setPackSetupProfileOverlay(undefined));

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

    const resolution = resolveT3WorkProjectSetupProfile({ profileId: "cloud-engineer" });
    expect(resolution.source).toBe("pack");
    expect(resolution.profile.id).toBe("cloud-engineer");
    expect(resolution.profile.defaultRecipeWeights).toEqual({
      "technical-implementation-plan": 30,
    });
  });

  it("falls back to bundled profiles when no pack overlay is set", () => {
    expect(getPackSetupProfileDescriptors()).toBeUndefined();
    const resolution = resolveT3WorkProjectSetupProfile({ profileId: "product-partner" });
    expect(resolution.source).toBe("bundled");
  });

  it("keeps the default flag when mapping pack definitions for the resolver", () => {
    setPackSetupProfileOverlay([profile]);
    expect(getPackProfilesForResolver()?.["cloud-engineer"]?.default).toBe(true);
  });

  it("preselects the pack default when nothing is stored", () => {
    setPackSetupProfileOverlay([{ ...profile, id: "plain-role", default: false }, profile]);
    expect(resolveT3WorkProjectSetupProfileId(undefined)).toBe("cloud-engineer");
    const resolution = resolveT3WorkProjectSetupProfile({});
    expect(resolution.profile.id).toBe("cloud-engineer");
    expect(resolution.source).toBe("pack");
  });

  it("keeps a stored profile id ahead of the pack default", () => {
    setPackSetupProfileOverlay([{ ...profile, id: "plain-role", default: false }, profile]);
    expect(resolveT3WorkProjectSetupProfileId("plain-role")).toBe("plain-role");
    expect(resolveT3WorkProjectSetupProfileId("qa-assistant")).toBe("qa-assistant");
  });

  it("keeps the bundled default when the pack declares no default", () => {
    setPackSetupProfileOverlay([{ ...profile, default: false }]);
    expect(resolveT3WorkProjectSetupProfileId(undefined)).toBe(
      DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID,
    );
  });
});
