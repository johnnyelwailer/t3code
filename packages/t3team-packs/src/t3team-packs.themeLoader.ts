import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import type { WorkspacePackManifest } from "./t3team-packs.manifest.ts";
import { resolvePackAssetPath } from "./t3team-packs.assetPath.ts";
import {
  decodeThemeDefinition,
  type ThemeBrandAssets,
  type ThemeDefinition,
} from "./t3team-packs.theme.ts";

const BRAND_MIME_TYPES: Readonly<Record<string, string>> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function resolveBrandAssetDataUrl(packDirectory: string, asset: string): Promise<string> {
  if (asset.startsWith("data:")) return asset;
  const mimeType = BRAND_MIME_TYPES[NodePath.extname(asset).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported theme brand asset type: ${asset}`);
  const bytes = await NodeFSP.readFile(resolvePackAssetPath(packDirectory, asset));
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

async function resolveBrandAssets(
  packDirectory: string,
  brand: ThemeBrandAssets | undefined,
): Promise<ThemeBrandAssets | undefined> {
  if (!brand) return undefined;
  const entries = await Promise.all(
    Object.entries(brand).map(async ([key, value]) => [
      key,
      value === undefined ? undefined : await resolveBrandAssetDataUrl(packDirectory, value),
    ]),
  );
  return Object.fromEntries(entries) as ThemeBrandAssets;
}

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
      const brand = await resolveBrandAssets(packDirectory, definition.brand);
      return brand ? { ...definition, brand } : definition;
    }),
  );
}
