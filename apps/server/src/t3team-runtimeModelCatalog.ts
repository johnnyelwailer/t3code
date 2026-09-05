import { isProviderAvailable, type ModelSelection, type ServerProvider } from "@t3tools/contracts";

/** Agent-facing projection of the same live snapshots used by the model picker and turn router. */
export const buildRuntimeModelCatalog = (
  current: ModelSelection | undefined,
  providers: ReadonlyArray<ServerProvider>,
) => ({
  source: "ProviderRegistry live snapshots",
  currentSelection:
    current === undefined
      ? null
      : {
          instanceId: String(current.instanceId),
          model: current.model,
          options: current.options ?? [],
        },
  providers: providers.map((provider) => ({
    instanceId: String(provider.instanceId),
    driver: String(provider.driver),
    displayName: provider.displayName ?? String(provider.instanceId),
    available: isProviderAvailable(provider),
    installed: provider.installed,
    enabled: provider.enabled,
    status: provider.status,
    authStatus: provider.auth.status,
    selected: current?.instanceId === provider.instanceId,
    models: provider.models.map((model) => ({
      slug: model.slug,
      name: model.name,
      ...(model.shortName === undefined ? {} : { shortName: model.shortName }),
      ...(model.subProvider === undefined ? {} : { subProvider: model.subProvider }),
      isDefault: model.isDefault === true,
      isLegacy: model.isLegacy === true,
      selected: current?.instanceId === provider.instanceId && current.model === model.slug,
    })),
  })),
  usage:
    "Use instanceId as the workflow model provider and an exact model slug from that instance. " +
    "Call this tool again immediately before authoring when exact routing matters; the catalog is live.",
});
