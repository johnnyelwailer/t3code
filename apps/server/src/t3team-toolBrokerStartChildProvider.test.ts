/**
 * Cross-provider resolution for fork child turns: a parent may spawn a child on a
 * different configured provider instance. These check the pure decision logic —
 * inherit-vs-switch, model validity, and the unusable/unknown rejections.
 */
import { ProviderDriverKind, type ModelSelection, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveStartChildModelSelection } from "./t3team-toolBrokerStartChildProvider.ts";

const makeProvider = (
  instanceId: string,
  modelSlugs: ReadonlyArray<string>,
  over: Partial<ServerProvider> = {},
): ServerProvider =>
  ({
    instanceId,
    driver: instanceId,
    enabled: true,
    installed: true,
    models: modelSlugs.map((slug) => ({ slug, name: slug, isCustom: false, capabilities: null })),
    ...over,
  }) as unknown as ServerProvider;

// Fictional model slugs so the shared model-slug normalizer is an identity here
// and the assertions test THIS resolver's decisions, not the model catalog.
const parent = {
  instanceId: "gateway",
  model: "gateway-a",
  options: [],
} as unknown as ModelSelection;

const providers: ReadonlyArray<ServerProvider> = [
  makeProvider("gateway", ["gateway-a"]),
  makeProvider("claude", ["claude-a", "claude-b"]),
  makeProvider("codex", ["codex-a"]),
  makeProvider("offline", ["offline-a"], { enabled: false }),
];

describe("resolveStartChildModelSelection", () => {
  it("inherits the parent's provider when none is requested", () => {
    const result = resolveStartChildModelSelection({ parentModelSelection: parent, providers });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.instanceId).toBe("gateway");
  });

  it("runs the child on a different provider + model (cross-provider)", () => {
    const result = resolveStartChildModelSelection({
      parentModelSelection: parent,
      requestedProvider: "codex",
      requestedModel: "codex-a",
      providers,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.instanceId).toBe("codex");
      expect(result.value.model).toBe("codex-a");
    }
  });

  it("fails a different instance that declares no default instead of picking its first model", () => {
    const result = resolveStartChildModelSelection({
      parentModelSelection: parent,
      requestedProvider: "claude",
      providers,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("no declared default");
      expect(result.error.choices).toEqual(["claude-a", "claude-b"]);
    }
  });

  it("rejects an unknown provider instance", () => {
    const result = resolveStartChildModelSelection({
      parentModelSelection: parent,
      requestedProvider: "nope",
      providers,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Unknown provider instance");
  });

  it("rejects a disabled / unavailable provider", () => {
    const result = resolveStartChildModelSelection({
      parentModelSelection: parent,
      requestedProvider: "offline",
      providers,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("cannot run a child");
  });

  it("rejects a model the target provider does not offer", () => {
    const result = resolveStartChildModelSelection({
      parentModelSelection: parent,
      requestedProvider: "claude",
      requestedModel: "codex-a",
      providers,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("is not available on provider instance");
  });

  it("keeps a validated snapshot slug when the instance id resembles another driver", () => {
    const result = resolveStartChildModelSelection({
      parentModelSelection: parent,
      requestedProvider: "codex",
      requestedModel: "gpt-5",
      providers: [
        makeProvider("codex", ["gpt-5"], {
          driver: ProviderDriverKind.make("claudeAgent"),
        }),
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.model).toBe("gpt-5");
  });

  it("maps reasoning effort through the target model capability descriptor", () => {
    const target = makeProvider("target", ["model"], {
      driver: ProviderDriverKind.make("custom-driver"),
      models: [
        {
          slug: "model",
          name: "Model",
          isCustom: false,
          capabilities: {
            optionDescriptors: [
              {
                id: "effort",
                label: "Effort",
                type: "select",
                options: [{ id: "high", label: "High" }],
              },
            ],
          },
        },
      ],
    });
    const result = resolveStartChildModelSelection({
      parentModelSelection: parent,
      requestedProvider: "target",
      requestedModel: "model",
      reasoningEffort: "high",
      providers: [target],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.options).toEqual([{ id: "effort", value: "high" }]);
  });

  it("drops parent options the resolved model does not advertise", () => {
    const declared = makeProvider("nexplore", [], {
      models: [
        {
          slug: "declared",
          name: "declared",
          isCustom: false,
          isDefault: true,
          capabilities: {
            optionDescriptors: [
              {
                id: "reasoningEffort",
                label: "Reasoning",
                type: "select",
                options: [
                  { id: "low", label: "Low" },
                  { id: "high", label: "High" },
                ],
              },
            ],
          },
        },
      ],
    });
    const dropped = resolveStartChildModelSelection({
      parentModelSelection: {
        ...parent,
        options: [
          { id: "reasoningEffort", value: "xhigh" },
          { id: "fastMode", value: true },
        ],
      },
      providers: [declared],
    });
    const kept = resolveStartChildModelSelection({
      parentModelSelection: {
        ...parent,
        options: [{ id: "reasoningEffort", value: "high" }],
      },
      providers: [declared],
    });
    expect(dropped.ok && dropped.value.options).toEqual([]);
    expect(kept.ok && kept.value.options).toEqual([{ id: "reasoningEffort", value: "high" }]);
  });

  it("names the owning instance when an unknown instance token is a model slug", () => {
    const result = resolveStartChildModelSelection({
      parentModelSelection: parent,
      requestedProvider: "opencode-go",
      requestedModel: "glm-5.3",
      providers: [makeProvider("opencode", ["opencode-go"])],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("opencode/opencode-go/glm-5.3");
  });
});
