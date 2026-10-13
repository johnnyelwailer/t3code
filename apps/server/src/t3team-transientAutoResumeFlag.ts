/**
 * Runtime feature flag: transient-failure auto-resume (live composer retry banner, durable
 * continuation of a run that failed on a transient gateway error, the banner's toggle).
 *
 * Layering: `NEXI_FF_TRANSIENT_AUTO_RESUME` env override > feature_flags DB value > code default
 * (on). Off restores the session retry exactly as before: three in-memory retries, then the run
 * stays failed, one note per failed run. Read live on every call.
 */
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export const TRANSIENT_AUTO_RESUME_FLAG_ENV = "NEXI_FF_TRANSIENT_AUTO_RESUME";

export function isTransientAutoResumeEnabled(readEnv: ReadEnv = processEnv): boolean {
  return readFeatureFlag("TRANSIENT_AUTO_RESUME", readEnv);
}
