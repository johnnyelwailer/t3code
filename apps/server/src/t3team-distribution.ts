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

export type DistributionBranding = {
  readonly productName?: string;
  readonly iconPng?: string;
  readonly userDataDirName?: string;
};

/** The distribution's theme JSON (raw; brand paths resolved at activation). `undefined` when none. */
export type DistributionTheme = Record<string, unknown>;

/** The compiled-in distribution's `activate(context)` entry, or `undefined` when none was built in. */
export const activateDistribution: PackActivate | undefined = undefined;
/** Inlined distribution assets: pack-root-relative path -> data URL. Empty when no distribution. */
export const distributionAssets: Readonly<Record<string, string>> = {};
/** The distribution's theme, or `undefined` when none was built in. */
export const distributionTheme: DistributionTheme | undefined = undefined;
/** Distribution branding (product name, icon, home dir), or `undefined` when none was built in. */
export const distributionBranding: DistributionBranding | undefined = undefined;
