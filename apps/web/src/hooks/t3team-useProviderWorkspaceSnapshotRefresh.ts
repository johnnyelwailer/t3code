import { useEffect, useRef, useState } from "react";
import {
  PROVIDER_WORKSPACE_SNAPSHOT_TTL_MS,
  type EnvironmentId,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import {
  hasCompleteProviderWorkspaceSnapshot,
  hasCurrentProviderWorkspaceSnapshot,
} from "@t3tools/client-runtime/providerSkills";

import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

const WORKSPACE_SNAPSHOT_RETRY_COOLDOWN_MS = 10_000;

/**
 * Keeps the selected provider's workspace snapshot for one cwd scanned and current, so a
 * composer's `/` menu sees that workspace's skills and slash commands the way the server sees
 * them. One scan request per TTL window, with a retry cooldown when the server has not finished
 * the scan yet; when a previously complete snapshot disappears the TTL entry resets so the
 * rescan request is not suppressed. `revalidationKey` re-checks the TTL whenever it changes; the
 * composers pass their prompt text, so typing after the TTL has lapsed triggers a fresh scan.
 */
export function useProviderWorkspaceSnapshotRefresh(input: {
  readonly provider: ServerProvider | null;
  readonly instanceId: ProviderInstanceId | null;
  readonly cwd: string | null;
  readonly environmentId: EnvironmentId | null;
  readonly revalidationKey: string;
}) {
  const { provider, instanceId, cwd, environmentId, revalidationKey } = input;
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  // The last scan this composer asked for. A request inside the TTL is not
  // repeated, so a client clock ahead of the server's cannot loop rescans.
  const workspaceRefreshKeyRef = useRef<{ key: string; requestedAt: number } | null>(null);
  const [workspaceRefreshRetry, setWorkspaceRefreshRetry] = useState<{
    key: string;
    notBefore: number;
  } | null>(null);
  const workspaceRefreshScopeKey =
    cwd && instanceId ? `${environmentId}:${instanceId}:${cwd}` : null;
  const workspaceSlashCommandsPending =
    provider?.workspaceSnapshots?.some(
      (snapshot) => snapshot.cwd === cwd && snapshot.slashCommandsPending === true,
    ) ?? false;
  useEffect(() => {
    if (
      !workspaceSlashCommandsPending ||
      !workspaceRefreshRetry ||
      workspaceRefreshRetry.key !== workspaceRefreshScopeKey
    )
      return;
    const timeout = setTimeout(
      () => {
        setWorkspaceRefreshRetry((current) => (current === workspaceRefreshRetry ? null : current));
      },
      Math.max(0, workspaceRefreshRetry.notBefore - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [workspaceRefreshRetry, workspaceRefreshScopeKey, workspaceSlashCommandsPending]);
  const hadWorkspaceSnapshotRef = useRef(false);
  useEffect(() => {
    const hasWorkspaceSnapshot = hasCompleteProviderWorkspaceSnapshot(provider, cwd);
    if (hadWorkspaceSnapshotRef.current && !hasWorkspaceSnapshot) {
      workspaceRefreshKeyRef.current = null;
      setWorkspaceRefreshRetry(null);
    }
    hadWorkspaceSnapshotRef.current = hasWorkspaceSnapshot;
  }, [cwd, provider]);
  useEffect(() => {
    if (!cwd || !instanceId || environmentId === null) return;
    const key = `${environmentId}:${instanceId}:${cwd}`;
    const now = Date.now();
    const lastRequest = workspaceRefreshKeyRef.current;
    if (
      lastRequest?.key === key &&
      now - lastRequest.requestedAt < PROVIDER_WORKSPACE_SNAPSHOT_TTL_MS
    )
      return;
    if (hasCurrentProviderWorkspaceSnapshot(provider, cwd, now)) {
      setWorkspaceRefreshRetry(null);
      return;
    }
    const retry = workspaceRefreshRetry;
    if (retry?.key === key && now < retry.notBefore) return;
    const request = { key, requestedAt: now };
    workspaceRefreshKeyRef.current = request;
    const retryLater = () => {
      if (workspaceRefreshKeyRef.current !== request) return;
      workspaceRefreshKeyRef.current = null;
      setWorkspaceRefreshRetry({
        key,
        notBefore: Date.now() + WORKSPACE_SNAPSHOT_RETRY_COOLDOWN_MS,
      });
    };
    void refreshProviders({
      environmentId,
      input: { instanceId, cwd },
    }).then((result) => {
      const hasWorkspaceSnapshot =
        result._tag === "Success" &&
        hasCompleteProviderWorkspaceSnapshot(
          result.value.providers.find((provider) => provider.instanceId === instanceId),
          cwd,
        );
      if (!hasWorkspaceSnapshot) retryLater();
    }, retryLater);
  }, [
    cwd,
    environmentId,
    instanceId,
    provider,
    refreshProviders,
    revalidationKey,
    workspaceRefreshRetry,
  ]);
}
