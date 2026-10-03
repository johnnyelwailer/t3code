/**
 * The provider-agnostic `effort` tier in the shared child model resolver
 * (`resolveStartChildModelSelection`, used by workflow child turns and the delegate_task
 * `effort` extension). It routes through the SAME `applyWorkflowEffort` seam — one mapping,
 * not two. What must hold:
 *
 *   • the tier lands on whatever reasoning control the RESOLVED provider/model advertises, both
 *     when inheriting the parent's provider and when switching providers;
 *   • the instance and model are never swapped out from under the caller;
 *   • a provider with no reasoning control is a silent NO-OP — never a failed spawn;
 *   • the explicit, provider-vocabulary `reasoningEffort` stays the more specific request and
 *     wins when both are supplied (they write the same option).
 */
import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveStartChildModelSelection } from "./t3team-toolBrokerStartChildProvider.ts";

const selectCaps = (options: ReadonlyArray<{ id: string; isDefault?: boolean }>) => ({
  optionDescriptors: [
    {
      id: "reasoningEffort",
      label: "Reasoning",
      type: "select",
      options: options.map((option) => ({ ...option, label: option.id })),
    },
  ],
});
const booleanCaps = () => ({
  optionDescriptors: [{ id: "thinking", label: "Thinking", type: "boolean" }],
});

const provider = (
  instanceId: string,
  slugs: ReadonlyArray<string>,
  capabilities: unknown,
): ServerProvider =>
  ({
    instanceId,
    driver: instanceId,
    enabled: true,
    installed: true,
    models: slugs.map((slug) => ({ slug, name: slug, isCustom: false, capabilities })),
  }) as unknown as ServerProvider;

// Fictional slugs so the shared slug normalizer is an identity here.
const ladder = provider(
  "ladder",
  ["ladder-a"],
  selectCaps([{ id: "low" }, { id: "medium", isDefault: true }, { id: "high" }, { id: "xhigh" }]),
);
const toggle = provider("toggle", ["toggle-a"], booleanCaps());
const plain = provider("plain", ["plain-a"], null);
// A gateway whose tiers ARE the model slugs (tier aliases) and that advertises no reasoning
// control — the effort must land on the closest tier model.
const tiered = provider("tiered", ["no-thinking", "low", "medium", "high"], null);

const providers = [ladder, toggle, plain, tiered];

const parentOn = (instanceId: string, model: string): ModelSelection =>
  ({ instanceId, model, options: [] }) as unknown as ModelSelection;

const resolve = (input: Parameters<typeof resolveStartChildModelSelection>[0]) => {
  const result = resolveStartChildModelSelection(input);
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.value;
};

describe("child effort — inheriting the parent's provider", () => {
  const parent = parentOn("ladder", "ladder-a");

  it("maps the tier onto the provider's own reasoning ladder", () => {
    expect(resolve({ parentModelSelection: parent, effort: "light", providers }).options).toEqual([
      { id: "reasoningEffort", value: "low" },
    ]);
    expect(resolve({ parentModelSelection: parent, effort: "high", providers }).options).toEqual([
      { id: "reasoningEffort", value: "xhigh" },
    ]);
    expect(
      resolve({ parentModelSelection: parent, effort: "standard", providers }).options,
    ).toEqual([{ id: "reasoningEffort", value: "medium" }]);
  });

  it("never swaps the instance or the model to satisfy the tier", () => {
    const value = resolve({ parentModelSelection: parent, effort: "high", providers });
    expect(value.instanceId).toBe("ladder");
    expect(value.model).toBe("ladder-a");
  });

  it("uses the boolean control when that is all the provider exposes", () => {
    const onToggle = parentOn("toggle", "toggle-a");
    expect(resolve({ parentModelSelection: onToggle, effort: "high", providers }).options).toEqual([
      { id: "thinking", value: true },
    ]);
    expect(resolve({ parentModelSelection: onToggle, effort: "light", providers }).options).toEqual(
      [{ id: "thinking", value: false }],
    );
  });

  it("maps the tier onto the provider's tier models when those are all it exposes (tiered)", () => {
    const onFast = parentOn("tiered", "low");
    // The bug this guards: a Fast-tier parent + effort 'high' used to silently stay on 'low'
    // because the tiered provider advertises no reasoning control to map onto.
    expect(resolve({ parentModelSelection: onFast, effort: "high", providers }).model).toBe("high");
    expect(resolve({ parentModelSelection: onFast, effort: "light", providers }).model).toBe("low");
    expect(resolve({ parentModelSelection: onFast, effort: "standard", providers }).model).toBe(
      "medium",
    );
  });

  it("never swaps the instance when the tier moves the model to another rung", () => {
    const value = resolve({
      parentModelSelection: parentOn("tiered", "low"),
      effort: "high",
      providers,
    });
    expect(value.instanceId).toBe("tiered");
    expect(value.model).toBe("high");
  });
});

describe("child effort — cross-provider", () => {
  it("maps the tier against the REQUESTED provider's control, not the parent's", () => {
    const value = resolve({
      parentModelSelection: parentOn("toggle", "toggle-a"),
      requestedProvider: "ladder",
      requestedModel: "ladder-a",
      effort: "high",
      providers,
    });
    expect(value.instanceId).toBe("ladder");
    expect(value.options).toEqual([{ id: "reasoningEffort", value: "xhigh" }]);
  });
});

describe("child effort — documented no-op degrade", () => {
  it("is a silent no-op when the provider exposes no reasoning control", () => {
    const value = resolve({
      parentModelSelection: parentOn("plain", "plain-a"),
      effort: "high",
      providers,
    });
    expect(value.instanceId).toBe("plain");
    expect(value.model).toBe("plain-a");
    expect(value.options).toEqual([]);
  });

  it("is a no-op when the provider snapshot is unknown, rather than failing the spawn", () => {
    const value = resolve({
      parentModelSelection: parentOn("ladder", "ladder-a"),
      effort: "high",
      providers: [],
    });
    expect(value.options).toEqual([]);
  });

  it("leaves a boolean control untouched for the standard tier (provider default wins)", () => {
    expect(
      resolve({
        parentModelSelection: parentOn("toggle", "toggle-a"),
        effort: "standard",
        providers,
      }).options,
    ).toEqual([]);
  });
});

describe("child effort — precedence over the provider-specific dial", () => {
  it("lets the explicit reasoning_effort win when both are supplied", () => {
    const value = resolve({
      parentModelSelection: parentOn("ladder", "ladder-a"),
      reasoningEffort: "low",
      effort: "high",
      providers,
    });
    expect(value.options).toEqual([{ id: "reasoningEffort", value: "low" }]);
  });
});
