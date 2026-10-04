/**
 * Pure provider/model slug resolution helpers for the fork child
 * cross-provider resolver (split out of
 * `t3team-toolBrokerStartChildProvider.ts`).
 */

import {
  isProviderAvailable,
  type ModelSelection,
  type ProviderOptionSelection,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";

export class WorkflowModelSelectionError extends Error {
  readonly _tag = "WorkflowModelSelectionError";
  readonly reason:
    | "unknown_instance"
    | "unknown_model"
    | "unavailable_instance"
    | "no_models"
    | "registry_unavailable";
  readonly choices: ReadonlyArray<string>;

  constructor(
    reason: WorkflowModelSelectionError["reason"],
    message: string,
    choices: ReadonlyArray<string> = [],
  ) {
    super(message);
    this.name = this._tag;
    this.reason = reason;
    this.choices = choices;
  }
}

export const formatList = (values: ReadonlyArray<string>): string => {
  if (values.length === 0) return "none";
  return values.map((value) => `'${value}'`).join(", ");
};

/** The provider-declared current default. There is no latest model when this is absent. */
const declaredDefault = (
  provider: Pick<ServerProvider, "models">,
): ServerProviderModel | undefined =>
  provider.models.find((model) => model.isDefault === true && model.isLegacy !== true);

const modelChoices = (provider: ServerProvider): ReadonlyArray<string> => {
  const current = provider.models.filter((model) => model.isLegacy !== true);
  const choices = current.length === 0 ? provider.models : current;
  const preferred = declaredDefault(provider);
  return [
    ...(preferred ? [preferred.slug] : []),
    ...choices.filter((model) => model !== preferred).map((model) => model.slug),
  ];
};

export const unusableReason = (provider: ServerProvider): string | undefined => {
  if (!isProviderAvailable(provider)) {
    return provider.unavailableReason ?? "the provider driver is unavailable in this build";
  }
  if (!provider.installed) return "the provider is not installed";
  if (!provider.enabled) return "the provider is disabled";
  return undefined;
};

export type SlugResult =
  | { readonly ok: true; readonly slug: string }
  | {
      readonly ok: false;
      readonly message: string;
      readonly error: WorkflowModelSelectionError;
    };

export const resolveSlug = (
  provider: ServerProvider,
  requestedModel: string | undefined,
  parent: ModelSelection,
): SlugResult => {
  if (requestedModel !== undefined) {
    const wanted = requestedModel.trim().toLowerCase();
    const match = provider.models.find((model) => model.slug.toLowerCase() === wanted);
    if (!match) {
      const choices = modelChoices(provider);
      const error = new WorkflowModelSelectionError(
        "unknown_model",
        `Model '${requestedModel}' is not available on provider instance ` +
          `'${provider.instanceId}'. Valid models: ${formatList(choices)}. ` +
          `Use model: "${provider.instanceId}/<slug>" with one of these exact slugs.`,
        choices,
      );
      return { ok: false, message: error.message, error };
    }
    return { ok: true, slug: match.slug };
  }

  const chosen = declaredDefault(provider) ?? inheritedParentModel(provider, parent);
  if (chosen) return { ok: true, slug: chosen.slug };
  const choices = modelChoices(provider);
  const error = new WorkflowModelSelectionError(
    "no_models",
    provider.models.length === 0
      ? `Provider instance '${provider.instanceId}' has no models configured to run a child on.`
      : `Provider instance '${provider.instanceId}' has no declared default model. Valid models: ${formatList(choices)}. Use model: "${provider.instanceId}/<slug>" with one of these exact slugs.`,
    choices,
  );
  return { ok: false, message: error.message, error };
};

const inheritedParentModel = (
  provider: ServerProvider,
  parent: ModelSelection,
): ServerProviderModel | undefined => {
  if (provider.instanceId.toLowerCase() !== parent.instanceId.toLowerCase()) return undefined;
  const wanted = parent.model.trim().toLowerCase();
  return provider.models.find((model) => model.slug.toLowerCase() === wanted);
};

/** Parent options the resolved model actually advertises. Unsupported values are dropped. */
export const optionsSupportedByModel = (
  provider: ServerProvider,
  slug: string,
  options: ReadonlyArray<ProviderOptionSelection> | undefined,
): ReadonlyArray<ProviderOptionSelection> => {
  const descriptors =
    provider.models.find((model) => model.slug === slug)?.capabilities?.optionDescriptors ?? [];
  return (options ?? []).filter((selection) => {
    const descriptor = descriptors.find((candidate) => candidate.id === selection.id);
    if (!descriptor) return false;
    if (descriptor.type === "boolean") return typeof selection.value === "boolean";
    return descriptor.options.some((choice) => choice.id === selection.value);
  });
};

/**
 * When the unknown instance token is a catalog model slug, name the real
 * instance id so a bare slug can be rewritten as instance/slug.
 */
export const slugPrefixHint = (
  requestedInstance: string,
  requestedModel: string | undefined,
  providers: ReadonlyArray<ServerProvider>,
): string => {
  const wanted = requestedInstance.trim().toLowerCase();
  const owners = providers.filter((provider) =>
    provider.models.some((model) => model.slug.toLowerCase() === wanted),
  );
  if (owners.length === 0) return "";
  const rest = requestedModel === undefined ? "" : `/${requestedModel}`;
  const forms = owners.map((provider) => `${provider.instanceId}/${requestedInstance}${rest}`);
  return ` If '${requestedInstance}' is a model slug, prefix the instance id: ${forms.join(", ")}.`;
};
