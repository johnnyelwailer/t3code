import { APP_BASE_NAME, APP_DISPLAY_NAME } from "~/branding";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";

/**
 * The name a distribution wants on user-visible chrome. `labels.appName` is the
 * appearance label; `productName` is the theme's product name. Vendor strings
 * stay in place when neither is set.
 */
export function resolvePackAppName(
  appearance:
    | {
        readonly labels?: { readonly appName?: string } | undefined;
        readonly productName?: string | undefined;
      }
    | undefined,
  fallback: string,
): string {
  const fromLabel = appearance?.labels?.appName?.trim();
  if (fromLabel) return fromLabel;
  const fromProduct = appearance?.productName?.trim();
  if (fromProduct) return fromProduct;
  return fallback;
}

/** Product name without a stage suffix, or the vendor base name. */
export function usePackAppBaseName(): string {
  return resolvePackAppName(useT3TeamPackAppearance(), APP_BASE_NAME);
}

/** Product name for titles and eyebrows, or the vendor display name (with stage). */
export function usePackAppDisplayName(): string {
  return resolvePackAppName(useT3TeamPackAppearance(), APP_DISPLAY_NAME);
}
