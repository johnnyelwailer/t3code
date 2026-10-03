/**
 * Distribution model policy: the host's default model and an optional pinned text-generation
 * model, registered at boot by a pack or the compiled-in distribution (`defineModelPolicy`,
 * capability `model-policy:v1`). Read by `serverSettings` (text-generation default + override)
 * and `serverRuntimeStartup` (welcome-thread model). Boot-only, in memory, never persisted.
 */
import type { ModelPolicyDefinition } from "@t3team/packs";
import { ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export interface DistributionModelPolicy {
  readonly defaultModelSelection?: ModelSelection;
  readonly textGenerationModelSelection?: ModelSelection;
}

const decodeModelSelection = Schema.decodeUnknownSync(ModelSelection);

let policy: DistributionModelPolicy = {};

const toModelSelection = (field: string, selection: unknown): ModelSelection => {
  try {
    return decodeModelSelection(selection);
  } catch (cause) {
    throw new Error(`Model policy ${field} needs a valid instanceId and model`, { cause });
  }
};

/** Validates a pack-registered policy; throws when a selection does not decode. */
export function parseDistributionModelPolicy(
  definition: ModelPolicyDefinition,
): DistributionModelPolicy {
  const { defaultModelSelection, textGenerationModelSelection } = definition;
  return {
    ...(defaultModelSelection === undefined
      ? {}
      : {
          defaultModelSelection: toModelSelection("defaultModelSelection", defaultModelSelection),
        }),
    ...(textGenerationModelSelection === undefined
      ? {}
      : {
          textGenerationModelSelection: toModelSelection(
            "textGenerationModelSelection",
            textGenerationModelSelection,
          ),
        }),
  };
}

/** Validates and installs a pack-registered policy (replaces any earlier one). */
export function setDistributionModelPolicy(definition: ModelPolicyDefinition): void {
  policy = parseDistributionModelPolicy(definition);
}

/** Test seam: drop the registered policy. */
export function resetDistributionModelPolicy(): void {
  policy = {};
}

export function getConfiguredDefaultModelSelection(fallbackModel: string): ModelSelection {
  return (
    policy.defaultModelSelection ?? {
      instanceId: ProviderInstanceId.make("codex"),
      model: fallbackModel,
    }
  );
}

/** Pinned selection for server-side generated Git/thread text, when a policy registered one. */
export function getConfiguredTextGenerationModelSelection(): ModelSelection | undefined {
  return policy.textGenerationModelSelection;
}
