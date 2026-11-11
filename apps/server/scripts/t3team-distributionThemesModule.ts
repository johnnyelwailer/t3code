// @effect-diagnostics nodeBuiltinImport:off - build-time filesystem reader outside Effect runtime.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
// Relative for the same reason as the persistence module: vp loads this from the repo root.
import {
  DISTRIBUTION_THEME_ENV,
  orderedDistributionThemePaths,
  type DistributionThemeManifest,
} from "../../../packages/t3team-packs/src/t3team-packs.distributionThemes.ts";

const readTheme = (dir: string, themeRelPath: string): unknown => {
  const themePath = NodePath.resolve(dir, themeRelPath);
  if (!NodeFS.existsSync(themePath)) {
    throw new Error(`[t3code/distribution] theme not found: ${themePath}`);
  }
  return JSON.parse(NodeFS.readFileSync(themePath, "utf8"));
};

/** Fail the build when a theme references a brand asset that is not in the inlined asset map. */
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

/** The `distributionTheme` and `distributionAlternateThemes` exports of the compiled-in module. */
export function distributionThemeExports(
  dir: string,
  manifest: DistributionThemeManifest,
  assets: Record<string, string>,
): string {
  const [first, ...rest] = orderedDistributionThemePaths(
    manifest,
    process.env[DISTRIBUTION_THEME_ENV],
  ).map((path) => readTheme(dir, path));
  for (const theme of [first, ...rest]) {
    if (theme !== undefined) assertThemeBrandInlined(theme, assets);
  }
  return (
    `export const distributionTheme = ${first === undefined ? "undefined" : JSON.stringify(first)};\n` +
    `export const distributionAlternateThemes = ${JSON.stringify(rest)};\n`
  );
}
