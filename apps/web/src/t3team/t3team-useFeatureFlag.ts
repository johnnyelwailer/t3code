import {
  FEATURE_FLAG_DEFINITIONS,
  type FeatureFlagKey,
} from "@t3tools/project-context/t3teamFeatureFlags";
import type { ServerConfig } from "@t3tools/contracts";

import { useServerConfig } from "~/t3team/t3team-serverState";

/** Effective value the server advertises in `ServerConfig.featureFlags` (live via
 * `featureFlagsUpdated`); the code default for a server that predates the map. */
export function readServerFeatureFlag(
  config: Pick<ServerConfig, "featureFlags"> | null | undefined,
  key: FeatureFlagKey,
): boolean {
  return config?.featureFlags?.[key] ?? FEATURE_FLAG_DEFINITIONS[key].defaultEnabled;
}

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return readServerFeatureFlag(useServerConfig(), key);
}
