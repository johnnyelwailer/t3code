import * as NodeFSP from "node:fs/promises";

import type { WorkspacePackManifest } from "./t3work-packs.manifest.ts";
import { resolvePackAssetPath } from "./t3work-packs.assetPath.ts";
import { decodeThemeDefinition, type ThemeDefinition } from "./t3work-packs.theme.ts";

export async function loadManifestThemes(
  packDirectory: string,
  manifest: WorkspacePackManifest,
): Promise<readonly ThemeDefinition[]> {
  return Promise.all(
    (manifest.contents.themes ?? []).map(async (reference) => {
      const definition = decodeThemeDefinition(
        JSON.parse(
          await NodeFSP.readFile(resolvePackAssetPath(packDirectory, reference.path), "utf8"),
        ),
      );
      if (definition.id !== reference.id) {
        throw new Error(`Theme id mismatch: expected ${reference.id}, received ${definition.id}`);
      }
      return definition;
    }),
  );
}
