import { ProviderInstanceId } from "@t3tools/contracts";
import type { PackActivationContext } from "@t3team/pack-api";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { activateCompiledInDistribution } from "./t3team-distribution-bootstrap.ts";
import {
  getPackAppearanceOverlay,
  setPackAppearanceOverlay,
} from "./t3team-pack-appearanceOverlay.ts";
import { getPackProviderOverlay, setPackProviderOverlay } from "./t3team-pack-providerOverlay.ts";
import {
  getPackSetupProfileDescriptors,
  setPackSetupProfileOverlay,
} from "./t3team-pack-setupProfileOverlay.ts";
import {
  getWorkflowAgentModelPolicy,
  setWorkflowAgentModelPolicy,
} from "./t3team-workflowAgentModelPolicy.ts";
import {
  DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS,
  getWorkflowEphemeralConcurrencyPolicy,
  setWorkflowEphemeralConcurrencyPolicy,
} from "./t3team-workflowEphemeralConcurrencyPolicy.ts";
import { getWorkflowRepairPolicy, setWorkflowRepairPolicy } from "./t3team-workflowRepairPolicy.ts";

const { flags } = vi.hoisted(() => ({ flags: { missingAsset: false } }));

vi.mock("@t3code/distribution", () => ({
  activateDistribution: async (context: PackActivationContext) => {
    const icon = await context.resolveAssetDataUrl(
      flags.missingAsset ? "assets/missing.svg" : "assets/mark.svg",
      "image/svg+xml",
    );
    context.defineAgentProvider({
      schemaVersion: 1,
      id: "nexplore",
      driver: "nexplore",
      harness: "opencode",
      displayName: "Nexplore AI",
      accent: "#f05a00",
      iconDataUrl: icon,
      configuration: {
        kind: "upstream-provider",
        provider: {
          id: "nexplore-upstream",
          name: "Nexplore",
          baseURL: "https://api.nexplore.example/v1",
          api: "chat-completions",
          models: [{ id: "standard", name: "Standard" }],
        },
      },
    });
    context.defineProviderDriver({
      schemaVersion: 1,
      driver: "nexplore",
      displayName: "Nexplore AI",
      create: async () => {
        throw new Error("driver create is not exercised by this test");
      },
    });
    context.defineSetupProfile({
      id: "requirements-product",
      title: "Requirements Product",
      description: "Product requirements ownership.",
      badge: "Product",
      bullets: ["Own the requirement record"],
      category: "product",
      iconDataUrl: "data:image/png;base64,QU9B",
      audience: "product",
      communicationStyle: {
        technicalDepth: "medium",
        brevity: "balanced",
        guidanceStyle: "guided",
      },
      preferredArtifactKinds: ["spec"],
      recipeWeights: {},
      recommendedSkillPackIds: [],
      hideImplementationComplexity: true,
      default: true,
    });
    context.defineWorkflowRepairPolicy?.({
      maxAttempts: 5,
      modelSelection: { instanceId: "nexplore", model: "reasoning" },
    });
    context.defineWorkflowAgentModelPolicy?.({
      modelSelection: { instanceId: "nexplore", model: "light" },
    });
    context.defineWorkflowEphemeralConcurrencyPolicy?.({ maxActiveSteps: 8 });
  },
  distributionAssets: { "assets/mark.svg": "data:image/svg+xml;base64,QU9B" },
  distributionTheme: {
    schemaVersion: 1,
    id: "nexplore",
    name: "Nexplore",
    brand: { mark: "assets/mark.svg" },
    colors: { light: {}, dark: {} },
  },
  distributionBranding: undefined,
}));

describe("compiled-in distribution bootstrap", () => {
  afterEach(() => {
    flags.missingAsset = false;
    setPackProviderOverlay({
      configMap: {} as ReturnType<typeof getPackProviderOverlay>,
      driverDefinitions: new Map(),
    });
    setPackAppearanceOverlay(undefined);
    setPackSetupProfileOverlay(undefined);
    setWorkflowRepairPolicy({});
    setWorkflowAgentModelPolicy("inherit");
    setWorkflowEphemeralConcurrencyPolicy({
      maxActiveSteps: DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS,
    });
  });

  it("funnels the compiled-in distribution into the pack singletons", async () => {
    await activateCompiledInDistribution();

    const overlay = getPackProviderOverlay();
    expect(Object.keys(overlay)).toEqual(["nexplore"]);
    const instance = overlay[ProviderInstanceId.make("nexplore")];
    expect(instance?.displayName).toBe("Nexplore AI");
    expect(instance?.accentColor).toBe("#f05a00");
    expect(instance?.iconDataUrl).toBe("data:image/svg+xml;base64,QU9B");
    const config = instance?.config as
      | { readonly configContent: string; readonly customModels: string[] }
      | undefined;
    expect(config?.customModels).toEqual(["nexplore-upstream/standard"]);
    const configContent = JSON.parse(config?.configContent ?? "{}") as {
      provider: Record<string, { readonly npm?: string }>;
    };
    expect(configContent.provider["nexplore-upstream"]?.npm).toBe("@ai-sdk/openai-compatible");

    expect(getPackSetupProfileDescriptors()?.[0]).toMatchObject({
      id: "requirements-product",
      iconDataUrl: "data:image/png;base64,QU9B",
      default: true,
    });

    expect(getWorkflowRepairPolicy()).toEqual({
      maxAttempts: 5,
      modelSelection: { instanceId: "nexplore", model: "reasoning" },
      totalTimeBudgetMs: 900_000,
    });
    expect(getWorkflowAgentModelPolicy()).toEqual({ instanceId: "nexplore", model: "light" });
    expect(getWorkflowEphemeralConcurrencyPolicy()).toEqual({ maxActiveSteps: 8, maxLiveRuns: 8 });

    const appearance = getPackAppearanceOverlay();
    expect(appearance?.themeId).toBe("nexplore");
    expect(appearance?.brand?.mark).toBe("data:image/svg+xml;base64,QU9B");
  });

  it("rejects when the entry resolves an asset that was not inlined", async () => {
    flags.missingAsset = true;
    await expect(activateCompiledInDistribution()).rejects.toThrow(
      "Compiled-in distribution asset not found",
    );
  });
});
