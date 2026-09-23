/**
 * `resolveWorkflowChildModel` mirrors `start_child`'s cross-provider validation for
 * workflow-engine child spawning (`thread.turn` / `thread.create`). See
 * t3team-childProviderCatalog.ts for the singleton this reads from.
 */
import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import type { ModelSelection as WorkflowModelSelection } from "@t3team/sdk";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { setChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { resolveWorkflowChildModel } from "./t3team-workflowChildModel.ts";

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

const base: ModelSelection = {
  instanceId: "nexplore",
  model: "nexplore-a",
  options: [],
} as unknown as ModelSelection;

const providers: ReadonlyArray<ServerProvider> = [
  makeProvider("nexplore", ["nexplore-a"]),
  makeProvider("codex", ["codex-a"]),
];

const workflowModel = (provider: string, id: string): WorkflowModelSelection => ({
  provider,
  model: { kind: "model", id, provider },
});

afterEach(() => {
  setChildProviderCatalog(undefined);
});

describe("resolveWorkflowChildModel", () => {
  it("returns the base selection unchanged when nothing is requested", async () => {
    const result = await resolveWorkflowChildModel(base, undefined);
    expect(result).toEqual({ modelSelection: base });
    expect(result.modelSelection).toBe(base);
  });

  it("falls back to legacy blind mapping when no catalog is wired", async () => {
    const result = await resolveWorkflowChildModel(base, workflowModel("codex", "codex-a"));
    expect(result).toEqual({ modelSelection: { instanceId: "codex", model: "codex-a" } });
  });

  it("resolves a valid cross-provider + model request against the live catalog", async () => {
    setChildProviderCatalog(async () => providers);
    const { modelSelection } = await resolveWorkflowChildModel(
      base,
      workflowModel("codex", "codex-a"),
    );
    expect(modelSelection.instanceId).toBe("codex");
    expect(modelSelection.model).toBe("codex-a");
  });

  describe("auto-latest routing (NEXI_FF_AUTO_LATEST_MODEL)", () => {
    const previous = process.env.NEXI_FF_AUTO_LATEST_MODEL;
    afterEach(() => {
      if (previous === undefined) delete process.env.NEXI_FF_AUTO_LATEST_MODEL;
      else process.env.NEXI_FF_AUTO_LATEST_MODEL = previous;
    });
    const catalog = [makeProvider("codex", ["gpt-5.6-sol", "gpt-6-sol", "gpt-6-astra"])];

    it("routes a stale slug to the newest same-tier model by default and records it", async () => {
      delete process.env.NEXI_FF_AUTO_LATEST_MODEL;
      setChildProviderCatalog(async () => catalog);
      const result = await resolveWorkflowChildModel(base, workflowModel("codex", "gpt-5.6-sol"));
      expect(result.modelSelection).toMatchObject({ instanceId: "codex", model: "gpt-6-sol" });
      expect(result.modelRouting).toEqual({
        requested: "gpt-5.6-sol",
        effective: "gpt-6-sol",
        routed: true,
        reason: "same-tier-newer",
      });
    });

    it("runs the requested slug verbatim when the flag is off", async () => {
      process.env.NEXI_FF_AUTO_LATEST_MODEL = "0";
      setChildProviderCatalog(async () => catalog);
      const result = await resolveWorkflowChildModel(base, workflowModel("codex", "gpt-5.6-sol"));
      expect(result.modelSelection.model).toBe("gpt-5.6-sol");
      expect(result.modelRouting).toMatchObject({ routed: false, reason: "flag-off" });
    });
  });

  it("throws with 'Unknown provider instance' for an unconfigured provider", async () => {
    setChildProviderCatalog(async () => providers);
    await expect(
      resolveWorkflowChildModel(base, workflowModel("nope", "anything")),
    ).rejects.toThrow("Unknown provider instance");
  });

  it("picks the target provider's default model when none is requested", async () => {
    setChildProviderCatalog(async () => providers);
    const { modelSelection, modelRouting } = await resolveWorkflowChildModel(
      base,
      workflowModel("codex", "") as unknown as WorkflowModelSelection,
    );
    expect(modelSelection.instanceId).toBe("codex");
    expect(modelSelection.model).toBe("codex-a");
    expect(modelRouting).toBeUndefined();
  });
});
