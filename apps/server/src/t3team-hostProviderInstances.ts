/**
 * Provider drivers and instances the host contributes itself: neither the user's settings nor a
 * pack. Today only `remoteEnvironment` (flag `DELEGATE_CLOUD`), which delegate_task routes cloud
 * children to (`t3team-remoteEnvironmentDriver.ts`).
 *
 * Its instance is in the registry's config map (so it exists) and in the dispatch gate's (so a
 * child's run is admitted); a user's own settings entry for the id still wins in both. Its
 * snapshot reports it disabled, which keeps it out of pickers and settings.
 *
 * Layering: `NEXI_FF_DELEGATE_CLOUD` > feature_flags row > code default (off), read when the
 * registry hydrates.
 */
import type { ProviderInstanceConfigMap } from "@t3tools/contracts";
import type { AnyProviderDriver } from "@t3tools/provider-core/server/driver";
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

import { RemoteEnvironmentDriver } from "./t3team-remoteEnvironmentDriver.ts";
import { REMOTE_ENVIRONMENT_INSTANCE_ID } from "./t3team-remoteEnvironmentTarget.ts";
import { REMOTE_ENVIRONMENT_DRIVER } from "./t3team-remoteEnvironmentTurn.ts";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isDelegateCloudEnabled(readEnv: ReadEnv = processEnv): boolean {
  return readFeatureFlag("DELEGATE_CLOUD", readEnv);
}

export function hostProviderDrivers(
  readEnv: ReadEnv = processEnv,
): ReadonlyArray<AnyProviderDriver<never>> {
  return isDelegateCloudEnabled(readEnv) ? [RemoteEnvironmentDriver] : [];
}

export function hostProviderInstances(readEnv: ReadEnv = processEnv): ProviderInstanceConfigMap {
  return isDelegateCloudEnabled(readEnv)
    ? { [REMOTE_ENVIRONMENT_INSTANCE_ID]: { driver: REMOTE_ENVIRONMENT_DRIVER, enabled: true } }
    : {};
}
