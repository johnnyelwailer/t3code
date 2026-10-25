import type { ComponentType } from "react";
import type { PlatformOSType } from "react-native";
import distributionMobile from "@t3code/distribution-mobile";

import type { HomeEmptyStateProps, MobileExtensions } from "./t3team-api";

/**
 * The active extensions: stock (empty) unless a distribution build resolves the
 * `@t3code/distribution-mobile` specifier to its overlay entry.
 */
export const mobileExtensions: MobileExtensions = distributionMobile;

/**
 * The extension that replaces the empty home screen, or null for the stock empty home. A rule
 * that throws means "no opinion": the stock screen stays.
 */
export function homeEmptyStateFor(
  extensions: MobileExtensions,
  catalog: { readonly isLoadingConnections: boolean; readonly hasConnections: boolean },
  platform: PlatformOSType,
): ComponentType<HomeEmptyStateProps> | null {
  const slot = extensions.homeEmptyState;
  if (slot === undefined) return null;
  try {
    return slot.shouldRender(catalog, platform) ? slot.Component : null;
  } catch {
    return null;
  }
}

let installed = false;

/** Runs the distribution's startup hook once; a failing hook never stops the app from starting. */
export function runExtensionInstall(extensions: MobileExtensions = mobileExtensions): void {
  if (installed) return;
  installed = true;
  try {
    extensions.install?.();
  } catch (error) {
    console.warn("The distribution's startup hook failed.", error);
  }
}
