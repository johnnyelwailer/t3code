import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import type { ModelSelection as WorkflowModelSelection } from "@t3team/sdk";

export const toWorkflowModelSelection = (selection: ModelSelection): WorkflowModelSelection => ({
  provider: selection.instanceId,
  model: {
    kind: "model",
    id: selection.model,
    provider: selection.instanceId,
  },
});

export const fromWorkflowModelSelection = (selection: WorkflowModelSelection): ModelSelection => ({
  instanceId: ProviderInstanceId.make(selection.provider),
  model: selection.model.id,
});
