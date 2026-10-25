import type { MobileExtensions } from "./t3team-extensionTypes";
import overlay from "./t3team-overlay";

/**
 * The active extensions: stock (empty) unless the build resolves `./t3team-overlay` to an overlay
 * entry (a default export `satisfies MobileExtensions`). An overlay imports only `./t3team-extensionTypes`.
 */
export const mobileExtensions: MobileExtensions = overlay;
