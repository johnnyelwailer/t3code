import { describe, expect, it } from "vite-plus/test";

import { decodeSetupProfileDefinition, defineSetupProfile } from "./t3team-packs.index.ts";

const base = {
  id: "developer",
  title: "Developer",
  description: "Implementation guidance with diff-first defaults.",
  badge: "DEV",
  bullets: ["Plan the change", "Address PR feedback"],
  category: "engineering" as const,
  iconDataUrl: "data:image/png;base64,AAAA",
  audience: "engineering" as const,
  communicationStyle: {
    technicalDepth: "high" as const,
    brevity: "balanced" as const,
    guidanceStyle: "expert" as const,
  },
  preferredArtifactKinds: ["implementation-plan"],
  recipeWeights: { "technical-implementation-plan": 40 },
  recommendedSkillPackIds: ["engineering"],
  hideImplementationComplexity: false,
};

describe("setup profile definition", () => {
  it("decodes a complete profile and preserves behavior fields", () => {
    const decoded = decodeSetupProfileDefinition(defineSetupProfile(base));
    expect(decoded).toMatchObject(base);
  });

  it("rejects an empty bullet list", () => {
    expect(() => decodeSetupProfileDefinition({ ...base, bullets: [] })).toThrow();
  });

  it("rejects a non-image icon data URL", () => {
    expect(() =>
      decodeSetupProfileDefinition({ ...base, iconDataUrl: "javascript:alert(1)" }),
    ).toThrow();
  });

  it("rejects an unknown category", () => {
    expect(() =>
      decodeSetupProfileDefinition({ ...base, category: "marketing" as unknown as "product" }),
    ).toThrow();
  });
});
