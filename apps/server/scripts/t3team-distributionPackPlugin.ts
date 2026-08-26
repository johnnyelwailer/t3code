// @effect-diagnostics nodeBuiltinImport:off - build-time bundler plugin; it runs outside any Effect runtime.
/**
 * `@t3code/distribution` — the distribution build-input hook.
 *
 * A distribution (branding, provider + driver, recipes, profiles, policies) is a BUILD input,
 * not a runtime plugin. This plugin resolves the virtual module `@t3code/distribution` to either
 * the compiled-in distribution (when `T3CODE_DISTRIBUTION` names a distribution directory) or an
 * empty stub. The server source imports it exactly once (see t3team-server.ts); the value is
 * decided here at bundle time, so the packed server needs no distribution tree at runtime.
 *
 * The distribution directory carries a build-only `distribution.json` (entry + assetsDir +
 * branding) plus the entry module and its assets. The entry keeps the pack `activate(context)`
 * shape, so the same authoring code that used to be dynamically imported from a pack directory is
 * now compiled in. Assets are inlined as data URLs because the packed server is a single file that
 * cannot read external asset files at runtime.
 *
 * For typechecking and source runs (dev/tests), `@t3code/distribution` resolves via tsconfig
 * `paths` to `t3team-distribution.ts`, a stub with empty values, so the bootstrap no-ops and the
 * runtime pack loader (T3TEAM_PACKS_DIR) handles the distribution as it does today.
 *
 * Resolution guarantee: because the pack is compiled in, its bare imports are resolved against this
 * workspace (the server package), never against an ancestor node_modules of the distribution
 * checkout. An import that cannot be inlined from here fails the build with an actionable error
 * instead of becoming an external that crashes the packed server on first boot. See
 * `createDistributionResolver` below.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  createDistributionImportResolver,
  isBareSpecifier,
} from "./t3team-distributionImportResolver.ts";

const VIRTUAL_ID = "\0@t3code/distribution";
const SPECIFIER = "@t3code/distribution";

const MIME_BY_EXT: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

type DistributionManifest = {
  readonly entry?: string;
  readonly assetsDir?: string;
  readonly theme?: string;
  readonly branding?: Record<string, string>;
};

const readManifest = (dir: string): DistributionManifest => {
  const manifestPath = NodePath.join(dir, "distribution.json");
  let raw: string;
  try {
    raw = NodeFS.readFileSync(manifestPath, "utf8");
  } catch (cause) {
    throw new Error(
      `[t3code/distribution] cannot read ${manifestPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  try {
    return JSON.parse(raw) as DistributionManifest;
  } catch (cause) {
    throw new Error(
      `[t3code/distribution] ${manifestPath} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
};

const dataUrl = (filePath: string, ext: string): string => {
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const b64 = NodeFS.readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${b64}`;
};

/**
 * Walk `assetsDir` and inline every file as `packRootRelativePath -> dataUrl`. The key is relative
 * to the distribution root (not `assetsDir`) because the pack's `activate.ts` and the theme's brand
 * paths address assets pack-root-relative (e.g. `assets/nexplore-mark.svg`), which is also what
 * `resolveAssetDataUrl` is called with.
 */
const inlineAssets = (dir: string, assetsDir: string): Record<string, string> => {
  const root = NodePath.join(dir, assetsDir);
  const out: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of NodeFS.readdirSync(current, { withFileTypes: true })) {
      const abs = NodePath.join(current, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) {
        const rel = NodePath.relative(dir, abs).split(NodePath.sep).join("/");
        // Lowercase: the runtime theme loader lowercases extensions before its MIME lookup.
        out[rel] = dataUrl(abs, NodePath.extname(entry.name).toLowerCase());
      }
    }
  };
  if (NodeFS.existsSync(root)) walk(root);
  return out;
};

/** Read the distribution's theme JSON (raw; its brand paths are resolved at activation time). */
const readTheme = (dir: string, themeRelPath: string): unknown => {
  const themePath = NodePath.resolve(dir, themeRelPath);
  if (!NodeFS.existsSync(themePath)) {
    throw new Error(`[t3code/distribution] theme not found: ${themePath}`);
  }
  return JSON.parse(NodeFS.readFileSync(themePath, "utf8"));
};

const stubModule = (): string =>
  "export const activateDistribution = undefined;\n" +
  "export const distributionAssets = {};\n" +
  "export const distributionTheme = undefined;\n" +
  "export const distributionBranding = undefined;\n";

/** Fail the build when the theme references a brand asset that is not in the inlined asset map. */
const assertThemeBrandInlined = (theme: unknown, assets: Record<string, string>): void => {
  const brand = (theme as { readonly brand?: Record<string, string | undefined> } | undefined)
    ?.brand;
  if (!brand) return;
  const missing = Object.values(brand).filter(
    (value) => value !== undefined && !value.startsWith("data:") && !assets[value],
  );
  if (missing.length > 0) {
    throw new Error(
      `[t3code/distribution] theme brand assets are missing from the inlined asset map: ${missing.join(", ")}`,
    );
  }
};

const distributionModule = (dir: string): string => {
  const manifest = readManifest(dir);
  const entry = manifest.entry ?? "activate.ts";
  const entryPath = NodePath.resolve(dir, entry);
  if (!NodeFS.existsSync(entryPath)) {
    throw new Error(`[t3code/distribution] entry not found: ${entryPath}`);
  }
  const assets = manifest.assetsDir ? inlineAssets(dir, manifest.assetsDir) : {};
  const theme = manifest.theme ? readTheme(dir, manifest.theme) : undefined;
  if (theme !== undefined) assertThemeBrandInlined(theme, assets);
  const branding = manifest.branding ?? {};
  const entryUrl = entryPath.split(NodePath.sep).join("/");
  // The entry may export `activate` as the default or a named export — the runtime pack loader
  // accepts both (t3team-packs.activation.ts); the compiled-in path must accept the same.
  return (
    `import * as __entry from ${JSON.stringify(entryUrl)};\n` +
    `export const activateDistribution = __entry.default ?? __entry.activate;\n` +
    `export const distributionAssets = ${JSON.stringify(assets)};\n` +
    `export const distributionTheme = ${theme === undefined ? "undefined" : JSON.stringify(theme)};\n` +
    `export const distributionBranding = ${JSON.stringify(branding)};\n`
  );
};

/**
 * The canonical distribution directory the pack is compiled from, or undefined when building
 * without a distribution (the stub path). The bundler reports importers by their canonical
 * (symlink-resolved) path — e.g. /private/tmp on macOS — so canonicalize here or the prefix check
 * in `resolveId` compares different spellings of the same path.
 */
const distributionDir = (): string | undefined => {
  const dir = process.env.T3CODE_DISTRIBUTION?.trim();
  if (!dir) return undefined;
  const resolved = NodePath.resolve(dir);
  try {
    return NodeFS.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
};

export function t3teamDistributionPackPlugin(): {
  readonly name: string;
  resolveId(source: string, importer?: string): string | null;
  load(id: string): string | null;
} {
  const resolvePackImport = createDistributionImportResolver();
  return {
    name: "t3code-distribution",
    resolveId(source, importer) {
      if (source === SPECIFIER) return VIRTUAL_ID;
      const dir = distributionDir();
      if (!dir || !importer || !isBareSpecifier(source)) return null;
      // Only imports made by distribution modules (the compiled-in pack), never imports from the
      // server's own source, which already resolve in this workspace.
      const importerPath = NodePath.resolve(importer);
      if (!importerPath.startsWith(dir + NodePath.sep)) return null;
      return resolvePackImport(source, importerPath);
    },
    load(id) {
      if (id !== VIRTUAL_ID) return null;
      const dir = distributionDir();
      return dir ? distributionModule(dir) : stubModule();
    },
  };
}
