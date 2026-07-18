import {
  discoverLocalWorkspacePacks,
  loadManifestAiProviders,
  loadManifestThemes,
  activateWorkspacePack,
  resolveWorkspacePacks,
  type PackProviderDriverDefinition,
  type WorkspacePackResolution,
} from "@t3work/packs";
import type { EnvironmentAppearance } from "@t3tools/contracts";

import { BUILT_IN_DRIVERS } from "./provider/builtInDrivers.ts";
import { packAiProvidersToInstanceConfigMap } from "./t3work-pack-aiProvider.ts";
import type { PackProviderOverlay } from "./t3work-pack-providerOverlay.ts";

const BUILT_IN_DRIVER_KINDS = new Set(BUILT_IN_DRIVERS.map((driver) => String(driver.driverKind)));

export type WorkspacePackHostDiagnostic = {
  readonly enabled: boolean;
  readonly root?: string;
  readonly resolution?: WorkspacePackResolution;
  readonly issues: readonly { readonly directory: string; readonly message: string }[];
};

export const loadPackProviderOverlay = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<PackProviderOverlay> => {
  const providerPacks = (diagnostic.resolution?.packs ?? []).filter((pack) => {
    const hasProviders = (pack.manifest.contents.aiProviders?.length ?? 0) > 0;
    if (
      hasProviders &&
      !pack.manifest.capabilities.some((capability) => capability.startsWith("ai-provider:"))
    ) {
      throw new Error(
        `Pack ${pack.manifest.id} declares AI providers without an ai-provider capability`,
      );
    }
    return hasProviders || Boolean(pack.manifest.entrypoints?.activate);
  });
  const definitions = (
    await Promise.all(
      providerPacks.map(async (pack) => {
        const loaded = await loadManifestAiProviders(pack.directory, pack.manifest);
        for (const provider of loaded) {
          const capability = `ai-provider:${provider.driver}`;
          if (!pack.manifest.capabilities.includes(capability)) {
            throw new Error(
              `Pack ${pack.manifest.id} declares AI provider ${provider.id} without ${capability} capability`,
            );
          }
        }
        return loaded;
      }),
    )
  ).flat();
  const driverDefinitions = new Map<string, PackProviderDriverDefinition>();
  for (const pack of providerPacks) {
    await activateWorkspacePack(pack, {
      defineAgentProvider: (definition) => {
        definitions.push(definition);
      },
      defineProviderDriver: (definition) => {
        registerPackDriver(
          driverDefinitions,
          pack.manifest.id,
          pack.manifest.capabilities,
          definition,
        );
      },
      defineTheme: () => undefined,
      resolveAssetDataUrl: async () => {
        throw new Error("Asset resolution is only available to pack activation code");
      },
    });
  }
  return {
    configMap: packAiProvidersToInstanceConfigMap(definitions),
    driverDefinitions,
  };
};

/**
 * Register one executable driver definition, enforcing the
 * `provider-driver:<driver>` capability gate and rejecting driver ids that
 * collide with another pack driver or a built-in driver.
 */
const registerPackDriver = (
  registry: Map<string, PackProviderDriverDefinition>,
  packId: string,
  capabilities: ReadonlyArray<string>,
  definition: PackProviderDriverDefinition,
): void => {
  const capability = `provider-driver:${definition.driver}`;
  if (!capabilities.includes(capability)) {
    throw new Error(
      `Pack ${packId} registers provider driver ${definition.driver} without ${capability} capability`,
    );
  }
  if (BUILT_IN_DRIVER_KINDS.has(definition.driver)) {
    throw new Error(
      `Pack ${packId} provider driver ${definition.driver} collides with a built-in driver`,
    );
  }
  if (registry.has(definition.driver)) {
    throw new Error(`Duplicate provider driver id ${definition.driver} (pack ${packId})`);
  }
  registry.set(definition.driver, definition);
};

export const loadPackAppearanceOverlay = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<EnvironmentAppearance | undefined> => {
  const themedPacks = (diagnostic.resolution?.packs ?? []).filter(
    (pack) =>
      (pack.manifest.contents.themes?.length ?? 0) > 0 ||
      Boolean(pack.manifest.entrypoints?.activate),
  );
  const themes = await Promise.all(
    themedPacks.map(async (pack) => {
      if (
        (pack.manifest.contents.themes?.length ?? 0) > 0 &&
        !pack.manifest.capabilities.includes("theme:v1")
      ) {
        throw new Error(`Pack ${pack.manifest.id} declares themes without theme:v1 capability`);
      }
      return loadManifestThemes(pack.directory, pack.manifest);
    }),
  );
  const activatedThemes: EnvironmentAppearance[] = [];
  for (const pack of themedPacks) {
    await activateWorkspacePack(pack, {
      defineAgentProvider: () => undefined,
      defineProviderDriver: () => undefined,
      defineTheme: (theme) => {
        if (!pack.manifest.capabilities.includes("theme:v1")) {
          throw new Error(`Pack ${pack.manifest.id} defines a theme without theme:v1 capability`);
        }
        activatedThemes.push({ ...theme, themeId: theme.id });
      },
      resolveAssetDataUrl: async () => {
        throw new Error("Asset resolution is only available to pack activation code");
      },
    });
  }
  const active = [
    ...themes.flat().map((theme) => ({ ...theme, themeId: theme.id })),
    ...activatedThemes,
  ].at(-1);
  if (!active) return undefined;
  return active;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Reads opted-in local packs without applying product behavior. Discovery failures are diagnostics,
 * not startup failures, so a bad optional distribution cannot prevent access to the host.
 */
export const inspectConfiguredWorkspacePacks = async (
  root: string | undefined,
): Promise<WorkspacePackHostDiagnostic> => {
  if (!root) return { enabled: false, issues: [] };

  try {
    const discovery = await discoverLocalWorkspacePacks(root);
    return {
      enabled: true,
      root,
      resolution: resolveWorkspacePacks(discovery.packs),
      issues: discovery.issues,
    };
  } catch (error) {
    return {
      enabled: true,
      root,
      issues: [{ directory: root, message: errorMessage(error) }],
    };
  }
};
