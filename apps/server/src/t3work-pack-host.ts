import {
  discoverLocalWorkspacePacks,
  resolveWorkspacePacks,
  type WorkspacePackResolution,
} from "@t3work/packs";

export type WorkspacePackHostDiagnostic = {
  readonly enabled: boolean;
  readonly root?: string;
  readonly resolution?: WorkspacePackResolution;
  readonly issues: readonly { readonly directory: string; readonly message: string }[];
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
