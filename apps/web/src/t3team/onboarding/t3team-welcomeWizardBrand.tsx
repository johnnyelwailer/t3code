import type { ReactNode } from "react";

import { APP_BASE_NAME } from "~/branding";
import { isNexploreBrand, PackBrandIdentity } from "~/t3team/components/t3team-PackBrandIdentity";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";

/**
 * The product name and identity mark the welcome wizard shows. Upstream spells "T3 Code" and
 * draws the T3 wordmark; a distribution build shows the pack's configured name and brand mark,
 * the same source the sidebar header reads. `identity` is null when no pack names the product,
 * so the wizard keeps upstream's wordmark.
 */
export function useWelcomeWizardBrand(): { productName: string; identity: ReactNode | null } {
  const appearance = useT3TeamPackAppearance();
  const packAppName = appearance?.labels?.appName;
  if (!packAppName) return { productName: APP_BASE_NAME, identity: null };
  return {
    productName: packAppName,
    identity: (
      <div className="flex items-center gap-2" role="img" aria-label={packAppName}>
        <PackBrandIdentity
          appearance={appearance}
          appName={packAppName}
          markClassName={isNexploreBrand(appearance) ? "h-5" : "size-7"}
          labelClassName="text-2xl font-medium tracking-tight text-muted-foreground"
        />
      </div>
    ),
  };
}
