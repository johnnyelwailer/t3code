import { useEffect, useEffectEvent, useRef, useState } from "react";
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
import { useStableCallback } from "./useStableCallback";

const WORKSPACE_SNAPSHOT_RETRY_COOLDOWN_MS = 10_000;

/**
 * Keeps the selected provider's workspace snapshot for one cwd scanned and current, so a
 * composer's `/` menu sees that workspace's skills and slash commands the way the server sees
 * them. One scan request per TTL window, with a retry cooldown when the server has not finished
 * the scan yet; losing a snapshot lifts both so the next check rescans at once. Returns a check
 * the composers run when the user types, so typing after the TTL has lapsed triggers a fresh scan.
 */
export function useProviderWorkspaceSnapshotRefresh(input: {
  readonly provider: ServerProvider | null;
  readonly instanceId: ProviderInstanceId | null;
  readonly cwd: string | null;
  readonly environmentId: EnvironmentId | null;
}) {
  const { provider, instanceId, cwd, environmentId } = input;
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
    cwd && instanceId && environmentId !== null ? `${environmentId}:${instanceId}:${cwd}` : null;
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
  const hasWorkspaceSnapshot = hasCompleteProviderWorkspaceSnapshot(provider, cwd);
  const [hadWorkspaceSnapshot, setHadWorkspaceSnapshot] = useState(hasWorkspaceSnapshot);
  const [workspaceSnapshotLossCount, setWorkspaceSnapshotLossCount] = useState(0);
  if (hadWorkspaceSnapshot !== hasWorkspaceSnapshot) {
    setHadWorkspaceSnapshot(hasWorkspaceSnapshot);
    if (!hasWorkspaceSnapshot) {
      setWorkspaceSnapshotLossCount((count) => count + 1);
      setWorkspaceRefreshRetry(null);
    }
  }
  const lastWorkspaceSnapshotLossRef = useRef(workspaceSnapshotLossCount);
  const refreshWorkspaceSnapshotIfStale = (
    now: number,
    key: string | null,
    retry: { key: string; notBefore: number } | null,
    snapshotLossCount: number,
  ) => {
    if (lastWorkspaceSnapshotLossRef.current !== snapshotLossCount) {
      lastWorkspaceSnapshotLossRef.current = snapshotLossCount;
      workspaceRefreshKeyRef.current = null;
    }
    if (key === null || !cwd || !instanceId || environmentId === null) return;
    const lastRequest = workspaceRefreshKeyRef.current;
    if (
      lastRequest?.key === key &&
      now - lastRequest.requestedAt < PROVIDER_WORKSPACE_SNAPSHOT_TTL_MS
    )
      return;
    // A pending retry needs no clearing here: its cooldown lapses long before the TTL.
    if (hasCurrentProviderWorkspaceSnapshot(provider, cwd, now)) return;
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
      const refreshedSnapshot =
        result._tag === "Success" &&
        hasCompleteProviderWorkspaceSnapshot(
          result.value.providers.find((candidate) => candidate.instanceId === instanceId),
          cwd,
        );
      if (!refreshedSnapshot) retryLater();
    }, retryLater);
  };
  const refreshWorkspaceSnapshotOnChange = useEffectEvent(refreshWorkspaceSnapshotIfStale);
  useEffect(() => {
    refreshWorkspaceSnapshotOnChange(
      Date.now(),
      workspaceRefreshScopeKey,
      workspaceRefreshRetry,
      workspaceSnapshotLossCount,
    );
  }, [workspaceRefreshScopeKey, workspaceRefreshRetry, workspaceSnapshotLossCount]);
  return useStableCallback(() =>
    refreshWorkspaceSnapshotIfStale(
      Date.now(),
      workspaceRefreshScopeKey,
      workspaceRefreshRetry,
      workspaceSnapshotLossCount,
    ),
  );
}
