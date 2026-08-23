/**
 * `effort` is the author's provider-agnostic thinking dial: it must land on whatever reasoning
 * control the CURRENT provider exposes (select ladder → tier, boolean → on/off), never change the
 * instance or the model, never clobber unrelated option selections, and — the load-bearing
 * property — degrade to a silent no-op when the tier cannot be expressed. An effort request must
 * never fail an ask.
 */

import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { setChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { resolveWorkflowChildModel } from "./t3team-workflowChildModel.ts";
import { applyWorkflowEffort, effortIsHonored } from "./t3team-workflowEffortOptions.ts";

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

const provider = (instanceId: string, slug: string, capabilities: unknown): ServerProvider =>
  ({
    instanceId,
    driver: instanceId,
    enabled: true,
    installed: true,
    models: [{ slug, name: slug, isCustom: false, capabilities }],
  }) as unknown as ServerProvider;

const selection = (instanceId: string, model: string, options: unknown = []): ModelSelection =>
  ({ instanceId, model, options }) as unknown as ModelSelection;

const codex = provider(
  "codex",
  "codex-a",
  selectCaps([{ id: "low" }, { id: "medium", isDefault: true }, { id: "high" }, { id: "xhigh" }]),
);
const claude = provider("claude", "claude-a", booleanCaps());
const plain = provider("plain", "plain-a", null);

describe("applyWorkflowEffort — select control", () => {
  const base = selection("codex", "codex-a");

  it("maps light to the lowest rung and high to the highest", () => {
    expect(applyWorkflowEffort(base, "light", [codex]).options).toEqual([
      { id: "reasoningEffort", value: "low" },
    ]);
    expect(applyWorkflowEffort(base, "high", [codex]).options).toEqual([
      { id: "reasoningEffort", value: "xhigh" },
    ]);
  });

  it("maps standard to the provider's declared default", () => {
    expect(applyWorkflowEffort(base, "standard", [codex]).options).toEqual([
      { id: "reasoningEffort", value: "medium" },
    ]);
  });

  it("orders by the documented ladder, not by declaration order", () => {
    const shuffled = provider(
      "codex",
      "codex-a",
      selectCaps([{ id: "high" }, { id: "minimal" }, { id: "medium" }]),
    );
    expect(applyWorkflowEffort(base, "light", [shuffled]).options).toEqual([
      { id: "reasoningEffort", value: "minimal" },
    ]);
  });

  it("keeps the instance, the model and unrelated option selections", () => {
    const withOther = selection("codex", "codex-a", [{ id: "serviceTier", value: "fast" }]);
    const result = applyWorkflowEffort(withOther, "high", [codex]);
    expect(result.instanceId).toBe("codex");
    expect(result.model).toBe("codex-a");
    expect(result.options).toEqual([
      { id: "serviceTier", value: "fast" },
      { id: "reasoningEffort", value: "xhigh" },
    ]);
  });

  it("replaces an existing reasoning selection rather than duplicating it", () => {
    const preset = selection("codex", "codex-a", [{ id: "reasoningEffort", value: "medium" }]);
    expect(applyWorkflowEffort(preset, "high", [codex]).options).toEqual([
      { id: "reasoningEffort", value: "xhigh" },
    ]);
  });
});

describe("applyWorkflowEffort — boolean control", () => {
  const base = selection("claude", "claude-a");

  it("turns thinking on for high and off for light", () => {
    expect(applyWorkflowEffort(base, "high", [claude]).options).toEqual([
      { id: "thinking", value: true },
    ]);
    expect(applyWorkflowEffort(base, "light", [claude]).options).toEqual([
      { id: "thinking", value: false },
    ]);
  });

  it("leaves standard at the provider default (no-op)", () => {
    expect(applyWorkflowEffort(base, "standard", [claude])).toBe(base);
  });
});

describe("applyWorkflowEffort — tier models (nexplore shape)", () => {
  // The Nexplore gateway exposes its tiers AS the model slugs (gateway aliases) and advertises
  // no reasoning control at all — the effort must land on the closest tier model, not degrade to
  // a silent no-op that leaves the child on whatever tier the parent happened to sit on.
  const nexplore = {
    instanceId: "nexplore",
    driver: "nexplore",
    enabled: true,
    installed: true,
    models: [
      { slug: "no-thinking", name: "Instant", isCustom: false, capabilities: null },
      { slug: "low", name: "Fast", isCustom: false, capabilities: null },
      { slug: "medium", name: "Standard", isCustom: false, capabilities: null },
      { slug: "high", name: "Deep", isCustom: false, capabilities: null },
    ],
  } as unknown as ServerProvider;
  const base = selection("nexplore", "low");

  it("maps high to the highest tier model, never the inherited lower one", () => {
    expect(applyWorkflowEffort(base, "high", [nexplore]).model).toBe("high");
  });

  it("maps light to the lowest rung and standard to the middle rung", () => {
    expect(applyWorkflowEffort(selection("nexplore", "high"), "light", [nexplore]).model).toBe(
      "low",
    );
    expect(applyWorkflowEffort(selection("nexplore", "high"), "standard", [nexplore]).model).toBe(
      "medium",
    );
  });

  it("keeps the instance and unrelated option selections", () => {
    const result = applyWorkflowEffort(
      selection("nexplore", "low", [{ id: "serviceTier", value: "fast" }]),
      "high",
      [nexplore],
    );
    expect(result.instanceId).toBe("nexplore");
    expect(result.model).toBe("high");
    expect(result.options).toEqual([{ id: "serviceTier", value: "fast" }]);
  });

  it("does not treat a single ladder slug as a tier ladder", () => {
    const single = provider("single", "high", null);
    const base = selection("single", "high");
    expect(applyWorkflowEffort(base, "light", [single])).toBe(base);
  });

  it("reports the tier honored for tier-model providers and un-honored for plain ones", () => {
    expect(effortIsHonored(selection("nexplore", "low"), "high", [nexplore])).toBe(true);
    expect(effortIsHonored(selection("plain", "plain-a"), "high", [plain])).toBe(false);
    expect(effortIsHonored(selection("codex", "codex-a"), "high", [codex])).toBe(true);
    expect(effortIsHonored(selection("codex", "codex-a"), undefined, [codex])).toBe(true);
  });
});

describe("applyWorkflowEffort — no-op degrade", () => {
  it("no effort requested", () => {
    const base = selection("codex", "codex-a");
    expect(applyWorkflowEffort(base, undefined, [codex])).toBe(base);
  });

  it("provider exposes no reasoning control", () => {
    const base = selection("plain", "plain-a");
    expect(applyWorkflowEffort(base, "high", [plain])).toBe(base);
  });

  it("instance or model missing from the snapshot", () => {
    const unknownInstance = selection("ghost", "ghost-a");
    expect(applyWorkflowEffort(unknownInstance, "high", [codex])).toBe(unknownInstance);
    const unknownModel = selection("codex", "other");
    expect(applyWorkflowEffort(unknownModel, "high", [codex])).toBe(unknownModel);
  });
});

describe("resolveWorkflowChildModel — effort", () => {
  afterEach(() => setChildProviderCatalog(undefined));

  it("applies effort to the run's own model without naming a provider", async () => {
    setChildProviderCatalog(async () => [codex]);
    const result = await resolveWorkflowChildModel(
      selection("codex", "codex-a"),
      undefined,
      "high",
    );
    expect(result.instanceId).toBe("codex");
    expect(result.model).toBe("codex-a");
    expect(result.options).toEqual([{ id: "reasoningEffort", value: "xhigh" }]);
  });

  it("degrades to a no-op — never an error — when no provider catalog is wired", async () => {
    const base = selection("codex", "codex-a");
    await expect(resolveWorkflowChildModel(base, undefined, "high")).resolves.toBe(base);
  });
});
