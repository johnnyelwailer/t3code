import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";

export function getConfiguredDefaultModelSelection(fallbackModel: string): ModelSelection {
  const instanceId = process.env.T3WORK_DEFAULT_MODEL_INSTANCE_ID?.trim();
  const model = process.env.T3WORK_DEFAULT_MODEL?.trim();

  return instanceId && model
    ? { instanceId: ProviderInstanceId.make(instanceId), model }
    : { instanceId: ProviderInstanceId.make("codex"), model: fallbackModel };
}

/** Optional distribution policy for server-side generated Git/thread text. */
export function getConfiguredTextGenerationModelSelection(): ModelSelection | undefined {
  const instanceId = process.env.T3WORK_TEXT_GENERATION_MODEL_INSTANCE_ID?.trim();
  const model = process.env.T3WORK_TEXT_GENERATION_MODEL?.trim();

  return instanceId && model
    ? { instanceId: ProviderInstanceId.make(instanceId), model }
    : undefined;
}
