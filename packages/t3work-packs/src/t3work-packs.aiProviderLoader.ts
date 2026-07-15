import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import {
  decodeAiProviderDefinition,
  type LoadedAiProviderDefinition,
} from "./t3work-packs.aiProvider.ts";
import type { PackAssetRef, WorkspacePackManifest } from "./t3work-packs.manifest.ts";

const resolveAssetPath = (packDirectory: string, path: string): string => {
  if (NodePath.isAbsolute(path)) throw new Error(`Pack asset path must be relative: ${path}`);
  const root = NodePath.resolve(packDirectory);
  const resolved = NodePath.resolve(root, path);
  if (resolved === root || !resolved.startsWith(`${root}${NodePath.sep}`)) {
    throw new Error(`Pack asset path escapes its pack directory: ${path}`);
  }
  return resolved;
};

export const loadAiProviderAsset = async (
  packDirectory: string,
  ref: PackAssetRef,
): Promise<LoadedAiProviderDefinition> => {
  const path = resolveAssetPath(packDirectory, ref.path);
  const source = await NodeFSP.readFile(path, "utf8");
  const definition = decodeAiProviderDefinition(JSON.parse(source));
  if (definition.id !== ref.id) {
    throw new Error(`AI provider ref ${ref.id} points to definition ${definition.id}`);
  }
  if (!definition.icon) return definition;
  const iconPath = resolveAssetPath(packDirectory, definition.icon);
  if (NodePath.extname(iconPath).toLowerCase() !== ".png") {
    throw new Error(`AI provider icon must be PNG: ${definition.icon}`);
  }
  const icon = await NodeFSP.readFile(iconPath);
  if (icon.byteLength > 64 * 1024) {
    throw new Error(`AI provider icon exceeds 64 KiB: ${definition.icon}`);
  }
  return { ...definition, iconDataUrl: `data:image/png;base64,${icon.toString("base64")}` };
};

export const loadManifestAiProviders = async (
  packDirectory: string,
  manifest: WorkspacePackManifest,
): Promise<readonly LoadedAiProviderDefinition[]> =>
  Promise.all(
    (manifest.contents.aiProviders ?? []).map((ref) => loadAiProviderAsset(packDirectory, ref)),
  );
