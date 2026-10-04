import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import { CLOUD_SESSION_REFRESH_INTERVAL_MS } from "@t3tools/client-runtime/state/cloud-sessions";
import { useCallback } from "react";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { cloudSessionEnvironment } from "~/state/t3team-cloudSessions";
import { relayEnvironmentDiscovery } from "~/state/relay";
import { useAtomCommand } from "~/state/use-atom-command";

import {
  acquireCloudSessionListRefresh,
  cloudSessionPollIntervalMs,
  useCloudSessionListPolling,
} from "./t3team-cloudSessionPolling";

/**
 * The cloud session list's refresh paths for one controller: a gated list
 * refresh, the relay discovery refresh, and the polling that drives both while
 * a surface showing the list is `active`.
 */
export function useCloudSessionListRefresh(
  environmentId: EnvironmentId | null,
  active: boolean,
  sessions: readonly CloudSession[],
) {
  const refreshRelayEnvironments = useAtomCommand(relayEnvironmentDiscovery.refresh, {
    reportFailure: false,
  });
  const refreshCloudSessionList = useCallback(() => {
    // Every list is a GHE call: the shared gate holds all triggers (poll ticks,
    // post-create/cancel refreshes, both surfaces) to one per gap.
    if (environmentId === null || !acquireCloudSessionListRefresh(environmentId)) return;
    appAtomRegistry.refresh(cloudSessionEnvironment.list({ environmentId, input: {} }));
  }, [environmentId]);
  const pollTick = useCallback(() => {
    refreshCloudSessionList();
    void refreshRelayEnvironments();
  }, [refreshCloudSessionList, refreshRelayEnvironments]);
  // Busy cadence only while something is provisioning; a change of cadence
  // restarts the poll, so a fresh create is picked up at once.
  const intervalMs = cloudSessionPollIntervalMs(sessions, CLOUD_SESSION_REFRESH_INTERVAL_MS);
  useCloudSessionListPolling(pollTick, active, intervalMs);
  return { refreshCloudSessionList, refreshRelayEnvironments } as const;
}
