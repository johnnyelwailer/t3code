/**
 * `@t3code/distribution-web` for a build without a distribution: no pack web modules. With
 * `T3CODE_DISTRIBUTION` set, `scripts/t3team-distributionWebPlugin.ts` replaces this module with
 * the distribution's list, in this same shape.
 */
import type { PackWebActivation } from "./t3team/packs/t3team-packWebHost";

export const webActivations: ReadonlyArray<PackWebActivation> = [];
