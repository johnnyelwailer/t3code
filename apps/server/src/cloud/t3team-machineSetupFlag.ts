/**
 * Runtime feature flag: set up a project machine when the project has none (issue #562).
 *
 * The server advertises it as `ServerConfig.machineSetup`. Off, a project without a machine
 * still starts a plain cloud session, and a setup request is refused.
 *
 * Layering: `NEXI_FF_MACHINE_SETUP` > feature_flags row > code default (off).
 */

import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

export const MACHINE_SETUP_FLAG_ENV = "NEXI_FF_MACHINE_SETUP";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isMachineSetupEnabled(readEnv: ReadEnv = processEnv): boolean {
  return readFeatureFlag("MACHINE_SETUP", readEnv);
}
