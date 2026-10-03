/**
 * A pack activation context that ignores every registration. Each boot loader activates the
 * packs once for the one content type it collects, so it spreads this and overrides only its own
 * `define*` callback; a new registration kind is added here once instead of in every loader.
 */
import type { PackActivationContext } from "@t3team/packs";

export const inertPackActivationContext: Omit<PackActivationContext, "pack"> = {
  defineAgentProvider: () => undefined,
  defineProviderDriver: () => undefined,
  defineTheme: () => undefined,
  defineSetupProfile: () => undefined,
  defineWorkflowRepairPolicy: () => undefined,
  defineWorkflowAgentModelPolicy: () => undefined,
  defineWorkflowEphemeralConcurrencyPolicy: () => undefined,
  defineModelPolicy: () => undefined,
  resolveAssetDataUrl: async () => {
    throw new Error("Asset resolution is only available to pack activation code");
  },
};
