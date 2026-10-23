/**
 * Client gate for My Work's RightPanelTabs aside. Server-authoritative runtime feature flag
 * (`MYWORK_RIGHT_PANEL`, default ON) read from the live `ServerConfig.featureFlags`; a server that
 * predates the map advertises `ServerConfig.myWorkRightPanel`, and absent there is treated as ON so
 * the new aside is the default once the client ships.
 */

import type { ServerConfig } from "@t3tools/contracts";

import { readPrimaryServerConfig, useServerConfig } from "~/t3team/t3team-serverState";
import { readServerFeatureFlagOr } from "~/t3team/t3team-useFeatureFlag";

export function isT3TeamMyWorkRightPanelEnabled(config: ServerConfig | null): boolean {
  return readServerFeatureFlagOr(config, "MYWORK_RIGHT_PANEL", config?.myWorkRightPanel !== false);
}

export function useT3TeamMyWorkRightPanelEnabled(): boolean {
  return isT3TeamMyWorkRightPanelEnabled(useServerConfig());
}

export function readT3TeamMyWorkRightPanelEnabled(): boolean {
  return isT3TeamMyWorkRightPanelEnabled(readPrimaryServerConfig());
}
