import type { ServerProvider, ServerProviderModel } from "@t3tools/contracts";

/**
 * Large catalogs (OpenCode, Cursor, Pi) can list hundreds of models, so agents
 * get a short list by default and search for the rest. These providers have
 * small official catalogs, so all their current models are listed.
 */
const FULL_CATALOG_DRIVERS: ReadonlySet<string> = new Set(["codex", "claudeAgent", "muse", "grok"]);
const LISTED_MODEL_LIMIT = 8;

/**
 * Picks the models orchestrator_capabilities shows for one provider. Hidden
 * models never appear. Search words naming the provider are dropped; other words
 * list matches. With no words left, lists pinned models (custom, favorite, the
 * caller's own) plus the provider's non-legacy models, or only the first few in
 * the user's model order for large catalogs.
 */
export function listCapabilityModels(input: {
  readonly provider: Pick<ServerProvider, "instanceId" | "driver" | "displayName" | "models">;
  readonly latestOnly: boolean;
  readonly includeLegacy?: boolean | undefined;
  readonly preferences:
    | { readonly hiddenModels: ReadonlyArray<string>; readonly modelOrder: ReadonlyArray<string> }
    | undefined;
  readonly isPinned: (model: ServerProviderModel) => boolean;
  readonly searchTerms: ReadonlyArray<string>;
}) {
  const rank = new Map(input.preferences?.modelOrder.map((slug, index) => [slug, index]));
  const visible = input.provider.models
    .filter((model) => model.isCustom || !input.preferences?.hiddenModels.includes(model.slug))
    .filter(
      (model) =>
        !input.latestOnly || input.includeLegacy || model.isCustom || model.isLegacy !== true,
    )
    .toSorted((a, b) => (rank.get(a.slug) ?? rank.size) - (rank.get(b.slug) ?? rank.size));
  const { instanceId, driver, displayName } = input.provider;
  const providerText = `${instanceId} ${driver} ${displayName ?? ""}`.toLowerCase();
  const modelTerms = input.searchTerms.filter((term) => !providerText.includes(term));
  if (modelTerms.length > 0) {
    const matches = visible.filter((model) => {
      const text = `${model.slug} ${model.name} ${model.subProvider ?? ""}`.toLowerCase();
      return modelTerms.every((term) => text.includes(term));
    });
    const listed = matches.slice(0, LISTED_MODEL_LIMIT);
    return { listed, omitted: matches.length - listed.length };
  }
  const current = visible.filter((model) => !model.isLegacy);
  const shown = new Set(
    FULL_CATALOG_DRIVERS.has(input.provider.driver)
      ? current
      : current.slice(0, LISTED_MODEL_LIMIT),
  );
  const listed = visible.filter(
    (model) =>
      input.isPinned(model) || shown.has(model) || (input.includeLegacy && model.isLegacy === true),
  );
  return { listed, omitted: visible.length - listed.length };
}
