/**
 * `resolveWorkflowChildModel` mirrors `start_child`'s cross-provider validation for
 * workflow-engine child spawning (`thread.turn` / `thread.create`). See
 * t3work-childProviderCatalog.ts for the singleton this reads from.
 */
import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import type { ModelSelection as WorkflowModelSelection } from "@t3work/sdk";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { setChildProviderCatalog } from "./t3work-childProviderCatalog.ts";
import { resolveWorkflowChildModel } from "./t3work-workflowChildModel.ts";

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
    expect(result).toBe(base);
  });

  it("falls back to legacy blind mapping when no catalog is wired", async () => {
    const result = await resolveWorkflowChildModel(base, workflowModel("codex", "codex-a"));
    expect(result).toEqual({ instanceId: "codex", model: "codex-a" });
  });

  it("resolves a valid cross-provider + model request against the live catalog", async () => {
    setChildProviderCatalog(async () => providers);
    const result = await resolveWorkflowChildModel(base, workflowModel("codex", "codex-a"));
    expect(result.instanceId).toBe("codex");
    expect(result.model).toBe("codex-a");
  });

  it("throws with 'Unknown provider instance' for an unconfigured provider", async () => {
    setChildProviderCatalog(async () => providers);
    await expect(
      resolveWorkflowChildModel(base, workflowModel("nope", "anything")),
    ).rejects.toThrow("Unknown provider instance");
  });

  it("picks the target provider's default model when none is requested", async () => {
    setChildProviderCatalog(async () => providers);
    const result = await resolveWorkflowChildModel(
      base,
      workflowModel("codex", "") as unknown as WorkflowModelSelection,
    );
    expect(result.instanceId).toBe("codex");
    expect(result.model).toBe("codex-a");
  });
});
