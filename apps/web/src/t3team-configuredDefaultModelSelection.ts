import { DEFAULT_MODEL, ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";

export function getConfiguredDefaultModelSelection(): ModelSelection {
  const instanceId = import.meta.env.VITE_T3TEAM_DEFAULT_MODEL_INSTANCE_ID?.trim();
  const model = import.meta.env.VITE_T3TEAM_DEFAULT_MODEL?.trim();

  return instanceId && model
    ? { instanceId: ProviderInstanceId.make(instanceId), model }
    : { instanceId: ProviderInstanceId.make("codex"), model: DEFAULT_MODEL };
}
