import type { ModelSelection, ServerProvider, ServerProviderModel } from "@t3tools/contracts";
import { resolveModelSlugForProvider } from "@t3tools/shared/model";

import type {
  T3TeamStartChildArgs,
  T3TeamStartChildReasoningEffort,
} from "./t3team-toolBrokerStartChildArgs.ts";

type TargetProvider = Pick<ServerProvider, "driver" | "models">;

const selectTargetModel = (
  target: TargetProvider | undefined,
  requestedModel: string,
): ServerProviderModel | undefined =>
  target?.models.find((model) => model.slug.toLowerCase() === requestedModel.toLowerCase());

const reasoningOptionId = (
  model: ServerProviderModel | undefined,
  effort: T3TeamStartChildReasoningEffort,
  baseModelSelection: ModelSelection,
): string | undefined => {
  const candidates = (model?.capabilities?.optionDescriptors ?? []).filter(
    (descriptor) =>
      descriptor.type === "select" && descriptor.options.some((option) => option.id === effort),
  );
  const semantic = candidates.find((descriptor) =>
    /reason|effort/i.test(`${descriptor.id} ${descriptor.label} ${descriptor.description ?? ""}`),
  );
  if (semantic) return semantic.id;
  if (candidates.length === 1) return candidates[0]?.id;
  return baseModelSelection.options?.find((option) => /reason|effort/i.test(option.id))?.id;
};

export const buildStartChildModelSelection = (
  baseModelSelection: ModelSelection,
  input: Pick<T3TeamStartChildArgs, "model" | "reasoningEffort">,
  target?: TargetProvider,
): ModelSelection => {
  const nextModel = input.model ?? baseModelSelection.model;
  const snapshotModel = selectTargetModel(target, nextModel);
  const normalizedModel = snapshotModel
    ? snapshotModel.slug
    : target
      ? resolveModelSlugForProvider(target.driver, nextModel)
      : nextModel;
  const selectedModel = snapshotModel ?? selectTargetModel(target, normalizedModel);
  const effortOptionId = input.reasoningEffort
    ? reasoningOptionId(selectedModel, input.reasoningEffort, baseModelSelection)
    : undefined;
  const effortSelection =
    effortOptionId && input.reasoningEffort
      ? { id: effortOptionId, value: input.reasoningEffort }
      : undefined;
  const nextSelections = effortSelection
    ? [
        ...(baseModelSelection.options ?? []).filter(
          (selection) => selection.id !== effortOptionId,
        ),
        effortSelection,
      ]
    : baseModelSelection.options;

  return {
    ...baseModelSelection,
    model: normalizedModel,
    ...(nextSelections ? { options: nextSelections } : {}),
  };
};

export const readModelSelectionReasoningEffort = (
  modelSelection: ModelSelection,
): string | undefined => {
  const selection = modelSelection.options?.find(
    (option) => typeof option.value === "string" && /reason|effort/i.test(option.id),
  );
  return typeof selection?.value === "string" ? selection.value : undefined;
};
