import { describe, expect, it } from "vite-plus/test";

import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";

import { resolveNewTaskModelSelection, type ModelOption } from "./modelOptions";
import { findNexiProviderDefaultSelection } from "./t3team-nexiProvider";

function option(instanceId: string, model: string, extra: Partial<ModelOption> = {}): ModelOption {
  return {
    key: `${instanceId}:${model}`,
    label: model,
    subtitle: "",
    providerKey: instanceId,
    providerLabel: instanceId,
    providerDriver: instanceId,
    isDefault: false,
    isLegacy: false,
    capabilities: null,
    selection: { instanceId: ProviderInstanceId.make(instanceId), model },
    ...extra,
  };
}

describe("Nexplore provider default", () => {
  it("prefers the Standard tier, then any available Nexplore model", () => {
    const instant = option("nexplore", "no-thinking");
    const standard = option("nexplore", "medium");

    expect(findNexiProviderDefaultSelection([instant, standard])).toBe(standard.selection);
    expect(
      findNexiProviderDefaultSelection([instant, { ...standard, isUnavailable: true }]),
    ).toBe(instant.selection);
  });

  it("leaves environments without the Nexplore provider to the server default", () => {
    expect(findNexiProviderDefaultSelection([option("codex", "gpt-5")])).toBeNull();
  });

  it("outranks the server default for fresh tasks but never an explicit or sticky pick", () => {
    const serverDefault = option("codex", "gpt-5", { isDefault: true });
    const nexplore = option("nexplore", "medium");
    const sticky: ModelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "sticky" };
    const resolve = (stickySelection: ModelSelection | null) =>
      resolveNewTaskModelSelection({
        draftSelection: null,
        projectDefaultSelection: null,
        stickySelection,
        modelOptions: [serverDefault, nexplore],
      });

    expect(resolve(null)).toBe(nexplore.selection);
    expect(resolve(sticky)).toBe(sticky);
  });
});
