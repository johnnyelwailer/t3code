/**
 * Runtime feature flag: staggered thread-subscription resubscribes (seam D of
 * the GHE #382 disconnect storm).
 *
 * The server advertises the flag to clients through `ServerConfig.threadResubscribeStagger`
 * — the capability-style optional boolean — and the client-runtime then spreads
 * thread resubscribe bursts over time instead of reopening every live thread
 * stream in the same tick after a session change.
 *
 * Layering (owner flag rule): `NEXI_FF_THREAD_RESUB_STAGGER` env override >
 * code default. The value is read live at config assembly, so the flag is
 * toggleable per process without a rebuild.
 */

/** Environment override for the resubscribe-stagger flag. `1`/`true` on, `0`/`false` off. */
export const THREAD_RESUB_STAGGER_FLAG_ENV = "NEXI_FF_THREAD_RESUB_STAGGER";

/**
 * Is staggered thread resubscription enabled? Unrecognized values default ON:
 * the stagger is the safe direction (it removes the disconnect storm); off is
 * the explicit opt-out back to the legacy all-at-once resubscribe.
 */
export function isThreadResubscribeStaggerEnabled(
  readEnv: (key: string) => string | undefined = (key) => process.env[key],
): boolean {
  const raw = readEnv(THREAD_RESUB_STAGGER_FLAG_ENV)?.trim().toLowerCase();
  if (raw === undefined) {
    return true;
  }
  return !(raw === "0" || raw === "false");
}
