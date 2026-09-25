/**
 * Runtime feature flag: auto-latest model routing. A model requested through
 * `t3team.thread.start_child` or a workflow `agent()` step is routed to the newest version the
 * target provider's live catalog reports (see `@t3tools/shared/t3team-modelRouting`), and the
 * requested-vs-effective pair is recorded on the launch result / step activity.
 *
 * Layering (owner flag rule): `NEXI_FF_AUTO_LATEST_MODEL` env override > code default. The
 * value is read live on every resolution, so the flag is toggleable per process without a
 * rebuild.
 */

/** Environment override for auto-latest model routing. `1`/`true` on, `0`/`false` off. */
export const AUTO_LATEST_MODEL_FLAG_ENV = "NEXI_FF_AUTO_LATEST_MODEL";

/**
 * Is auto-latest model routing enabled? Unrecognized values default ON (the owner-specified
 * default); `0`/`false` is the explicit opt-out back to running the requested slug verbatim.
 */
export function isAutoLatestModelEnabled(
  readEnv: (key: string) => string | undefined = (key) => process.env[key],
): boolean {
  const raw = readEnv(AUTO_LATEST_MODEL_FLAG_ENV)?.trim().toLowerCase();
  if (raw === undefined) {
    return true;
  }
  return !(raw === "0" || raw === "false");
}
