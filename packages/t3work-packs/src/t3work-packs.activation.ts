import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import type { LoadedAiProviderDefinition } from "./t3work-packs.aiProvider.ts";
import type { WorkspacePackManifest } from "./t3work-packs.manifest.ts";
import type { PackProviderDriverDefinition } from "./t3work-packs.providerDriver.ts";
import type { SetupProfileDefinition } from "./t3work-packs.setupProfile.ts";
import type { ThemeDefinition } from "./t3work-packs.theme.ts";

export type PackActivationContext = {
  readonly pack: { readonly directory: string; readonly manifest: WorkspacePackManifest };
  readonly defineAgentProvider: (definition: LoadedAiProviderDefinition) => void;
  readonly defineProviderDriver: (definition: PackProviderDriverDefinition) => void;
  readonly defineTheme: (definition: ThemeDefinition) => void;
  readonly defineSetupProfile: (definition: SetupProfileDefinition) => void;
  readonly resolveAssetDataUrl: (relativePath: string, mimeType: string) => Promise<string>;
};
export type PackActivate = (context: PackActivationContext) => void | Promise<void>;

function resolvePackPath(directory: string, path: string): string {
  const root = NodePath.resolve(directory);
  const resolved = NodePath.resolve(root, path);
  if (NodePath.isAbsolute(path) || !resolved.startsWith(`${root}${NodePath.sep}`)) {
    throw new Error(`Pack activation asset escapes its directory: ${path}`);
  }
  return resolved;
}

export async function activateWorkspacePack(
  pack: PackActivationContext["pack"],
  context: Omit<PackActivationContext, "pack">,
): Promise<void> {
  const entrypoint = pack.manifest.entrypoints?.activate;
  if (!entrypoint) return;
  const modulePath = resolvePackPath(pack.directory, entrypoint);
  const loaded = (await import(
    `${NodeURL.pathToFileURL(modulePath).href}?pack=${pack.manifest.id}`
  )) as {
    readonly default?: PackActivate;
    readonly activate?: PackActivate;
  };
  const activate = loaded.default ?? loaded.activate;
  if (typeof activate !== "function") {
    throw new Error(`Pack ${pack.manifest.id} activation entrypoint exports no activate function`);
  }
  await activate({
    ...context,
    pack,
    resolveAssetDataUrl: async (relativePath, mimeType) => {
      const bytes = await NodeFSP.readFile(resolvePackPath(pack.directory, relativePath));
      return `data:${mimeType};base64,${bytes.toString("base64")}`;
    },
  });
}
