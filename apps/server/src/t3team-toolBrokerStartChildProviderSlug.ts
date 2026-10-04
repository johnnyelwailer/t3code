/**
 * Pure provider/model slug resolution helpers for the start_child
 * cross-provider resolver (split out of
 * `t3team-toolBrokerStartChildProvider.ts`).
 */

import {
  isProviderAvailable,
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

/** Catalog order is authoritative; model identifiers carry no version semantics. */
export const defaultProviderModel = (
  provider: Pick<ServerProvider, "models">,
): ServerProviderModel | undefined =>
  provider.models.find((model) => model.isDefault === true && model.isLegacy !== true) ??
  provider.models.find((model) => model.isLegacy !== true) ??
  provider.models[0];

const modelChoices = (provider: ServerProvider): ReadonlyArray<string> => {
  const current = provider.models.filter((model) => model.isLegacy !== true);
  const choices = current.length === 0 ? provider.models : current;
  const preferred = defaultProviderModel(provider);
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

  const chosen = defaultProviderModel(provider);
  if (!chosen) {
    const error = new WorkflowModelSelectionError(
      "no_models",
      `Provider instance '${provider.instanceId}' has no models configured to run a child on.`,
    );
    return { ok: false, message: error.message, error };
  }
  return { ok: true, slug: chosen.slug };
};
