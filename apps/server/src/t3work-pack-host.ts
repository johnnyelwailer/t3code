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
    if (hasProviders && !pack.manifest.capabilities.includes("ai-provider:opencode")) {
      throw new Error(
        `Pack ${pack.manifest.id} declares AI providers without ai-provider:opencode capability`,
      );
    }
    return hasProviders;
  });
  const definitions = await Promise.all(
    providerPacks.map((pack) =>
      loadManifestAiProviders(pack.directory, pack.manifest),
    ),
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
