/**
 * The model cascade's host half: walk the author's provider ladder against the live snapshots and
 * pick the first rung that can actually run a turn.
 *
 * Load-bearing properties covered here:
 *   1. first AVAILABLE rung wins (not the first rung);
 *   2. an unconfigured / disabled / not-installed instance, and a model the instance does not own,
 *      all fall THROUGH with a recorded skip reason;
 *   3. a rung with no `instanceId` means "this model on the run's current provider";
 *   4. no rung available → no selection, and the caller keeps the run's default (never an error);
 *   5. the diagnostic names the winner and every skip, because a silent brain swap is undebuggable;
 *   6. `effort` composes with the CHOSEN rung, not the run's default.
 */

import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { setChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { resolveWorkflowModelCascade } from "./t3team-workflowChildModel.ts";
import { applyWorkflowEffort } from "./t3team-workflowEffortOptions.ts";
import { resolveModelCascade } from "./t3team-workflowModelCascade.ts";

const provider = (
  instanceId: string,
  models: ReadonlyArray<{ slug: string; capabilities?: unknown }>,
  over: Partial<ServerProvider> = {},
): ServerProvider =>
  ({
    instanceId,
    driver: instanceId,
    enabled: true,
    installed: true,
    models: models.map((model) => ({
      slug: model.slug,
      name: model.slug,
      isCustom: false,
      capabilities: model.capabilities ?? null,
    })),
    ...over,
  }) as unknown as ServerProvider;

const selection = (instanceId: string, model: string): ModelSelection =>
  ({ instanceId, model, options: [] }) as unknown as ModelSelection;

const reasoningCaps = {
  optionDescriptors: [
    {
      id: "reasoningEffort",
      label: "Reasoning",
      type: "select",
      options: [
        { id: "low", label: "low" },
        { id: "high", label: "high" },
      ],
    },
  ],
};

const nexplore = provider("nexplore", [{ slug: "minimax-m2.7" }, { slug: "qwen3.6-35b" }]);
const claudeAgent = provider("claudeAgent", [{ slug: "claude-opus-4-8" }]);
const base = selection("claudeAgent", "claude-opus-4-8");

describe("resolveModelCascade", () => {
  it("picks the first entry whose instance + model are both available", () => {
    const choice = resolveModelCascade({
      base,
      entries: [{ instanceId: "nexplore", model: "minimax-m2.7" }, { instanceId: "claudeAgent" }],
      providers: [nexplore, claudeAgent],
    });
    expect(choice.selection?.instanceId).toBe("nexplore");
    expect(choice.selection?.model).toBe("minimax-m2.7");
    expect(choice.reason).toContain("chose #1 (nexplore/minimax-m2.7)");
  });

  it("falls through an instance that is not configured at all", () => {
    const choice = resolveModelCascade({
      base,
      entries: [{ instanceId: "nexplore", model: "minimax-m2.7" }, { instanceId: "claudeAgent" }],
      providers: [claudeAgent],
    });
    expect(choice.selection?.instanceId).toBe("claudeAgent");
    expect(choice.selection?.model).toBe("claude-opus-4-8");
    expect(choice.reason).toContain("chose #2 (claudeAgent)");
    expect(choice.reason).toContain(
      "skipped #1 (nexplore/minimax-m2.7): Unknown provider instance",
    );
  });

  it("falls through a disabled instance and a model the instance does not own", () => {
    const choice = resolveModelCascade({
      base,
      entries: [
        { instanceId: "nexplore", model: "not-a-real-model" },
        { instanceId: "disabled" },
        { instanceId: "claudeAgent", model: "claude-opus-4-8" },
      ],
      providers: [
        nexplore,
        provider("disabled", [{ slug: "d-a" }], { enabled: false }),
        claudeAgent,
      ],
    });
    expect(choice.selection?.instanceId).toBe("claudeAgent");
    expect(choice.reason).toContain("is not available on provider instance 'nexplore'");
    expect(choice.reason).toContain("the provider is disabled");
  });

  it("treats a model-only entry as 'this model on the run's current provider'", () => {
    const twoModelBase = selection("nexplore", "minimax-m2.7");
    const choice = resolveModelCascade({
      base: twoModelBase,
      entries: [{ model: "qwen3.6-35b" }],
      providers: [nexplore],
    });
    expect(choice.selection?.instanceId).toBe("nexplore");
    expect(choice.selection?.model).toBe("qwen3.6-35b");
    expect(choice.reason).toContain("chose #1 (nexplore/qwen3.6-35b)");
  });

  it("falls through a model-only entry the current provider does not own", () => {
    const choice = resolveModelCascade({
      base,
      entries: [{ model: "minimax-m2.7" }, { instanceId: "claudeAgent" }],
      providers: [nexplore, claudeAgent],
    });
    expect(choice.selection?.instanceId).toBe("claudeAgent");
    expect(choice.reason).toContain("skipped #1 (claudeAgent/minimax-m2.7)");
  });

  it("returns no selection (never an error) when nothing on the ladder is available", () => {
    const choice = resolveModelCascade({
      base,
      entries: [{ instanceId: "gone" }, { instanceId: "also-gone", model: "x" }],
      providers: [nexplore],
    });
    expect(choice.selection).toBeUndefined();
    expect(choice.reason).toContain("no cascade entry is available");
    expect(choice.reason).toContain("keeping the run's default claudeAgent/claude-opus-4-8");
    expect(choice.reason).toContain("#1 (gone)");
    expect(choice.reason).toContain("#2 (also-gone/x)");
  });

  it("documents the empty ladder as a no-op", () => {
    const choice = resolveModelCascade({ base, entries: [], providers: [nexplore] });
    expect(choice.selection).toBeUndefined();
    expect(choice.reason).toContain("empty cascade");
  });

  it("composes with effort: the tier lands on the CHOSEN rung's controls", () => {
    const withCaps = provider("nexplore", [{ slug: "minimax-m2.7", capabilities: reasoningCaps }]);
    const choice = resolveModelCascade({
      base,
      entries: [{ instanceId: "nexplore" }, { instanceId: "claudeAgent" }],
      providers: [withCaps, claudeAgent],
    });
    expect(choice.selection?.instanceId).toBe("nexplore");
    const withEffort = applyWorkflowEffort(choice.selection as ModelSelection, "high", [
      withCaps,
      claudeAgent,
    ]);
    expect(withEffort.instanceId).toBe("nexplore");
    expect(withEffort.options).toEqual([{ id: "reasoningEffort", value: "high" }]);
  });
});

describe("resolveWorkflowModelCascade — live catalog", () => {
  afterEach(() => setChildProviderCatalog(undefined));

  it("resolves against the wired provider catalog", async () => {
    setChildProviderCatalog(async () => [nexplore, claudeAgent]);
    const choice = await resolveWorkflowModelCascade(base, [
      { instanceId: "nexplore", model: "qwen3.6-35b" },
    ]);
    expect(choice.selection?.instanceId).toBe("nexplore");
    expect(choice.selection?.model).toBe("qwen3.6-35b");
  });

  it("keeps the run's default when no registry is wired", async () => {
    const choice = await resolveWorkflowModelCascade(base, [{ instanceId: "nexplore" }]);
    expect(choice.selection).toBeUndefined();
    expect(choice.reason).toContain("no provider registry wired");
  });
});
