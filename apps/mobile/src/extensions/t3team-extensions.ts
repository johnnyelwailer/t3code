import type { ComponentType } from "react";
import type { PlatformOSType } from "react-native";

import type { HomeEmptyStateProps, MobileExtensions } from "./t3team-extensionTypes";
import overlay from "./t3team-overlay";

/**
 * The active extensions: stock (empty) unless the build resolves `./t3team-overlay` to an overlay
 * entry (a default export `satisfies MobileExtensions`). An overlay imports only
 * `./t3team-extensionTypes`.
 */
export const mobileExtensions: MobileExtensions = overlay;

/** The extension that replaces the empty home screen, or null for the stock empty home. */
export function homeEmptyStateFor(
  extensions: MobileExtensions,
  catalog: { readonly isLoadingConnections: boolean; readonly hasConnections: boolean },
  platform: PlatformOSType,
): ComponentType<HomeEmptyStateProps> | null {
  const slot = extensions.homeEmptyState;
  return slot?.shouldRender(catalog, platform) ? slot.Component : null;
}
