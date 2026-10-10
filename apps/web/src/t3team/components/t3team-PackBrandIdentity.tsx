import type { EnvironmentAppearance } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { T3TeamNexiWordmark } from "~/t3team/t3team-NexiWordmark";
import { T3TeamPackBrandImage } from "~/t3team/t3team-PackBrandImage";

/** The nexi wordmark is nexplore's own asset, so only that distribution may replace the mark. */
const NEXPLORE_THEME_ID = "nexplore";

export function isNexploreBrand(appearance: EnvironmentAppearance | undefined): boolean {
  return appearance?.themeId === NEXPLORE_THEME_ID;
}

/**
 * Drops a leading "Nexi" from the app name, because the wordmark beside it already says it —
 * "Nexi Work" reads as `nexi Work`, not `nexi Nexi Work`. Derived rather than hardcoded so a
 * differently-named distribution still shows its full name instead of losing its first word.
 */
export function brandSuffixLabel(appName: string): string {
  const remainder = appName.replace(/^nexi\s+/i, "").trim();
  return remainder.length > 0 ? remainder : appName;
}

type PackBrandIdentityProps = {
  appearance: EnvironmentAppearance | undefined;
  appName: string;
  /** Sizing for the wordmark (nexplore) or the pack's mark image (any other distribution). */
  markClassName: string;
  labelClassName: string;
  onBackdrop?: boolean;
};

/**
 * The pack's brand mark followed by its app name — the one rendering of the product identity
 * shared by the sidebar header and the welcome wizard, so the two can never disagree.
 */
export function PackBrandIdentity({
  appearance,
  appName,
  markClassName,
  labelClassName,
  onBackdrop = false,
}: PackBrandIdentityProps) {
  const isNexploreDistribution = isNexploreBrand(appearance);
  return (
    <>
      {isNexploreDistribution ? (
        <T3TeamNexiWordmark className={cn("w-auto shrink-0", markClassName)} />
      ) : (
        <T3TeamPackBrandImage
          brand={appearance?.brand}
          kind="mark"
          className={cn("shrink-0", markClassName)}
          onBackdrop={onBackdrop}
        />
      )}
      <span className={labelClassName}>
        {isNexploreDistribution ? brandSuffixLabel(appName) : appName}
      </span>
    </>
  );
}
