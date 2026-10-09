/**
 * Client gate for My Work's RightPanelTabs aside. Server-authoritative runtime feature flag
 * (`NEXI_FF_MYWORK_RIGHT_PANEL`, default ON) advertised as `ServerConfig.myWorkRightPanel`.
 * Absent on older servers is treated as ON so the new aside is the default once the client ships.
 */

import type { ServerConfig } from "@t3tools/contracts";

import { readPrimaryServerConfig, useServerConfig } from "~/t3team/t3team-serverState";

export function isT3TeamMyWorkRightPanelEnabled(config: ServerConfig | null): boolean {
  return config?.myWorkRightPanel !== false;
}

export function useT3TeamMyWorkRightPanelEnabled(): boolean {
  return isT3TeamMyWorkRightPanelEnabled(useServerConfig());
}

export function readT3TeamMyWorkRightPanelEnabled(): boolean {
  return isT3TeamMyWorkRightPanelEnabled(readPrimaryServerConfig());
}
