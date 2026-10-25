import type { MobileExtensions } from "./t3team-extensionTypes";

/**
 * The stock build fills no slot. A distribution build resolves this module to its own overlay
 * entry instead; see `./t3team-extensions.ts`.
 */
const stock: MobileExtensions = {};
export default stock;
