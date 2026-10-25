import type { MobileExtensions } from "./extensions/t3team-extensionTypes";

/**
 * `@t3code/distribution-mobile` for a build without a distribution: no slot is filled and nothing
 * is installed. With `T3CODE_DISTRIBUTION` naming a distribution whose `mobile.json` declares an
 * overlay, the Metro hook (`t3team-distributionMobileMetro.cjs`) resolves this specifier to the
 * overlay's entry instead, a default export of the same shape. The web twin is
 * `@t3code/distribution-web`.
 */
const distributionMobile: MobileExtensions = {};
export default distributionMobile;
