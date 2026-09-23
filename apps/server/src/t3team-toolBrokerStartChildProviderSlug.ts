/**
 * Pure provider/model slug resolution helpers for the start_child
 * cross-provider resolver (split out of
 * `t3team-toolBrokerStartChildProvider.ts`).
 */

import { isProviderAvailable, type ServerProvider } from "@t3tools/contracts";

export const MAX_LISTED = 12;

export const formatList = (values: ReadonlyArray<string>): string => {
  if (values.length === 0) return "none";
  const shown = values.slice(0, MAX_LISTED).map((value) => `'${value}'`);
  const extra = values.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} (+${extra} more)` : shown.join(", ");
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
  | { readonly ok: false; readonly message: string };

export const resolveSlug = (
  provider: ServerProvider,
  requestedModel: string | undefined,
  parentModel: string,
): SlugResult => {
  if (requestedModel) {
    const wanted = requestedModel.trim().toLowerCase();
    const match = provider.models.find((model) => model.slug.toLowerCase() === wanted);
    if (!match) {
      return {
        ok: false,
        message:
          `Model '${requestedModel}' is not available on provider instance ` +
          `'${provider.instanceId}'. Valid models: ${formatList(provider.models.map((m) => m.slug))}.`,
      };
    }
    return { ok: true, slug: match.slug };
  }

  const parentSlug = parentModel.trim().toLowerCase();
  const chosen =
    provider.models.find((model) => model.slug.toLowerCase() === parentSlug) ?? provider.models[0];
  if (!chosen) {
    return {
      ok: false,
      message: `Provider instance '${provider.instanceId}' has no models configured to run a child on.`,
    };
  }
  return { ok: true, slug: chosen.slug };
};
