import type { EnvironmentAppearance } from "@t3tools/contracts";

import { APP_BASE_NAME, APP_DISPLAY_NAME, APP_STAGE_LABEL } from "~/branding";
import { formatAppDisplayName } from "~/branding.logic";

import { useT3TeamPackAppearance } from "./t3team-packAppearance";

/**
 * Product name from the active pack appearance. `labels.appName` is the chrome
 * label; `productName` is the distribution identity when the label is absent.
 * Empty when no distribution is active so callers keep the vendor fallback.
 */
export function t3teamPackProductName(
  appearance: Pick<EnvironmentAppearance, "labels" | "productName"> | undefined,
): string | undefined {
  const label = appearance?.labels?.appName?.trim();
  if (label) return label;
  const productName = appearance?.productName?.trim();
  if (productName) return productName;
  return undefined;
}

export function t3teamAppDisplayName(
  appearance: Pick<EnvironmentAppearance, "labels" | "productName"> | undefined,
): string {
  const productName = t3teamPackProductName(appearance);
  if (!productName) return APP_DISPLAY_NAME;
  return formatAppDisplayName({ baseName: productName, stageLabel: APP_STAGE_LABEL });
}

export function useT3TeamAppBaseName(): string {
  return t3teamPackProductName(useT3TeamPackAppearance()) ?? APP_BASE_NAME;
}

export function useT3TeamAppDisplayName(): string {
  return t3teamAppDisplayName(useT3TeamPackAppearance());
}
