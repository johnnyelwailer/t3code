/**
 * Runtime feature flag: staggered thread-subscription resubscribes (seam D of
 * the GHE #382 disconnect storm).
 *
 * The server advertises the flag to clients through `ServerConfig.featureFlags` and, for older
 * clients, `ServerConfig.threadResubscribeStagger`; the client-runtime then spreads thread
 * resubscribe bursts over time instead of reopening every live thread stream in the same tick
 * after a session change.
 *
 * Layering: `NEXI_FF_THREAD_RESUB_STAGGER` env override > feature_flags user value > release
 * preset > code default (on). Off is the explicit opt-out back to the all-at-once resubscribe.
 * Read live at config assembly.
 */

import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

export function isThreadResubscribeStaggerEnabled(
  readEnv: (key: string) => string | undefined = (key) => process.env[key],
): boolean {
  return readFeatureFlag("THREAD_RESUB_STAGGER", readEnv);
}
