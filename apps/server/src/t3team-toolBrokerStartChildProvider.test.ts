/**
 * Cross-provider resolution for start_child: a parent may spawn a child on a
 * different configured provider instance. These check the pure decision logic —
 * inherit-vs-switch, model validity, and the unusable/unknown rejections.
 */
import { ProviderDriverKind, type ModelSelection, type ServerProvider } from "@t3tools/contracts";
import { it as effectIt } from "@effect/vitest";
import { describe, expect, it } from "vite-plus/test";

import * as Effect from "effect/Effect";

import {
  resolveChildModel,
  resolveStartChildModelSelection,
} from "./t3team-toolBrokerStartChildProvider.ts";

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
  instanceId: "nexplore",
  model: "nexplore-a",
  options: [],
} as unknown as ModelSelection;

const providers: ReadonlyArray<ServerProvider> = [
  makeProvider("nexplore", ["nexplore-a"]),
  makeProvider("claude", ["claude-a", "claude-b"]),
  makeProvider("codex", ["codex-a"]),
  makeProvider("offline", ["offline-a"], { enabled: false }),
];

describe("resolveStartChildModelSelection", () => {
  it("inherits the parent's provider when none is requested", () => {
    const result = resolveStartChildModelSelection({ parentModelSelection: parent, providers });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.instanceId).toBe("nexplore");
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

  it("defaults to the target provider's first model when none is requested", () => {
    const result = resolveStartChildModelSelection({
      parentModelSelection: parent,
      requestedProvider: "claude",
      providers,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.instanceId).toBe("claude");
      expect(result.value.model).toBe("claude-a");
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
      reasoningEffort: "high",
      providers: [target],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.options).toEqual([{ id: "effort", value: "high" }]);
  });
});

describe("resolveChildModel", () => {
  effectIt.effect(
    "fails distinctly when a provider is requested but the registry isn't wired",
    () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          resolveChildModel(parent, { provider: "codex" }, undefined),
        );
        expect(exit._tag).toBe("Failure");
        if (exit._tag === "Failure") {
          const message = String(exit.cause);
          expect(message).toContain("Provider registry is not wired into this server build");
          expect(message).toContain("codex");
        }
      }),
  );
});
