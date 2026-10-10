import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import type { ModelOption, ModelSelection as WorkflowModelSelection } from "@t3team/sdk";

import { WorkflowModelSelectionError } from "./t3team-toolBrokerStartChildProviderSlug.ts";

export const toWorkflowModelSelection = (selection: ModelSelection): WorkflowModelSelection => ({
  provider: selection.instanceId,
  model: {
    kind: "model",
    id: selection.model,
    provider: selection.instanceId,
  },
});

/** The outer provider in old objects identifies the instance; nested provider is model metadata. */
export const parseWorkflowModelOption = (
  selection: ModelOption,
): { readonly provider: string; readonly model: string | undefined } => {
  if (typeof selection !== "string") {
    return { provider: selection.provider, model: selection.model.id || undefined };
  }
  const slash = selection.indexOf("/");
  return slash < 0
    ? { provider: selection, model: undefined }
    : { provider: selection.slice(0, slash), model: selection.slice(slash + 1) };
};

export const fromWorkflowModelSelection = (selection: ModelOption): ModelSelection => {
  const requested = parseWorkflowModelOption(selection);
  if (requested.model === undefined) {
    throw new WorkflowModelSelectionError(
      "registry_unavailable",
      `Cannot choose the latest model for provider instance '${requested.provider}' because ` +
        `no provider registry is wired. Configure a live provider registry or use ` +
        `model: "${requested.provider}/<exact-slug>".`,
    );
  }
  return {
    instanceId: ProviderInstanceId.make(requested.provider),
    model: requested.model,
  };
};
