import distributionMobile from "@t3code/distribution-mobile";

import type { MobileExtensions } from "./t3team-extensionTypes";

/**
 * The active extensions: stock (empty) unless a distribution build resolves the
 * `@t3code/distribution-mobile` specifier to its overlay entry. Read it inside functions and
 * components, never at module top level: this module sits inside an import cycle when an overlay
 * imports the app (a drift guard test enforces it).
 */
export const mobileExtensions: MobileExtensions = distributionMobile;

let installed = false;

/** Runs the distribution's startup hook once; a failing hook never stops the app from starting. */
export function runExtensionInstall(extensions: MobileExtensions = mobileExtensions): void {
  if (installed) return;
  installed = true;
  const failed = (error: unknown) => console.warn("The distribution's startup hook failed.", error);
  try {
    void Promise.resolve(extensions.install?.()).catch(failed);
  } catch (error) {
    failed(error);
  }
}
