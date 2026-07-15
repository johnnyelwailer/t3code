import {
  discoverLocalWorkspacePacks,
  loadManifestAiProviders,
  resolveWorkspacePacks,
  type WorkspacePackResolution,
} from "@t3work/packs";
import type { ProviderInstanceConfigMap } from "@t3tools/contracts";

import { packAiProvidersToInstanceConfigMap } from "./t3work-pack-aiProvider.ts";

export type WorkspacePackHostDiagnostic = {
  readonly enabled: boolean;
  readonly root?: string;
  readonly resolution?: WorkspacePackResolution;
  readonly issues: readonly { readonly directory: string; readonly message: string }[];
};

export const loadPackProviderOverlay = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<ProviderInstanceConfigMap> => {
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
    return hasProviders;
  });
  const definitions = await Promise.all(
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
  );
  return packAiProvidersToInstanceConfigMap(definitions.flat());
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
