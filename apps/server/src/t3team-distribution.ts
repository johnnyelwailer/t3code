/**
 * `@t3code/distribution` — the compiled-in distribution, as a runtime module.
 *
 * The packed build replaces this module with an inlined distribution (see
 * `scripts/t3team-distributionPackPlugin.ts`), so the single-file server carries the distribution's
 * provider, driver, theme, profiles and policies with no distribution tree at runtime. This file is
 * the source-run shape: it is what dev and tests import when no distribution was compiled in. It
 * exports the same four values as the inlined module so `t3team-distribution-bootstrap.ts` has one
 * code path regardless of how the value arrived.
 */
import type { PackActivate } from "@t3team/pack-api";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DistributionBranding = {
  readonly productName?: string;
  readonly iconPng?: string;
  readonly userDataDirName?: string;
};

/** The distribution's theme JSON (raw; brand paths resolved at activation). `undefined` when none. */
export type DistributionTheme = Record<string, unknown>;

/**
 * When `T3CODE_DISTRIBUTION` names a directory with a `distribution.json`, read the theme and
 * branding from disk so the dev server carries the same identity as a packed build. The packed
 * build replaces this module with an inlined distribution, so this only runs in dev / tests.
 */
function readDistributionFromEnv(): {
  theme?: DistributionTheme;
  branding?: DistributionBranding;
} {
  const dir = process.env.T3CODE_DISTRIBUTION?.trim();
  if (!dir) return {};
  try {
    const manifest = JSON.parse(readFileSync(resolve(dir, "distribution.json"), "utf-8")) as {
      theme?: string;
      branding?: DistributionBranding;
    };
    const result: { theme?: DistributionTheme; branding?: DistributionBranding } = {};
    if (manifest.theme) {
      result.theme = JSON.parse(readFileSync(resolve(dir, manifest.theme), "utf-8"));
    }
    if (manifest.branding) result.branding = manifest.branding;
    return result;
  } catch {
    return {};
  }
}

const dist = readDistributionFromEnv();

/** The compiled-in distribution's `activate(context)` entry, or `undefined` when none was built in. */
export const activateDistribution: PackActivate | undefined = undefined;
/** Inlined distribution assets: pack-root-relative path -> data URL. Empty when no distribution. */
export const distributionAssets: Readonly<Record<string, string>> = {};
/** The distribution's theme, or `undefined` when none was built in. */
export const distributionTheme: DistributionTheme | undefined = dist.theme;
/** Distribution branding (product name, icon, home dir), or `undefined` when none was built in. */
export const distributionBranding: DistributionBranding | undefined = dist.branding;
