import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import { useCallback, useMemo, useState } from "react";

import { environmentCatalog } from "~/connection/catalog";
import {
  cloudSessionEnvironment,
  useCloudSessions,
  usePrimaryEnvironmentId,
} from "~/state/t3team-cloudSessions";
import { useAtomCommand } from "~/state/use-atom-command";
import { useRelayEnvironmentDiscovery } from "~/state/environments";
import { toastManager } from "~/components/ui/toast";
import { type RelayEnvironmentCandidate } from "~/components/cloud/t3team-cloudSessionConnect";
import {
  isTerminalCloudSessionPhase,
  mergeLocalCloudSession,
} from "~/components/cloud/t3team-cloudSessionSplit";
import { isCloudSessionProvisionPending } from "~/components/cloud/t3team-cloudSessionProvisionPresentation";
import { showCloudSessionFailureToast } from "./t3team-cloudSessionToast";
import { useCloudSessionListRefresh } from "./t3team-useCloudSessionListRefresh";
import { useCloudSessionConnect } from "./t3team-useCloudSessionConnect";
import { liveCloudSessionForEnvironment } from "./t3team-cloudSessionEnvironmentMatch";
import { useCloudSessionCreate } from "./t3team-useCloudSessionCreate";
import { useCanManageRelay } from "./t3team-useCanManageRelay";
import { acquireCloudSessionListRefresh } from "./t3team-cloudSessionPolling";
import { setCloudSessionLocal } from "./t3team-cloudSessionLocalStore";
import { useCloudSessionListDemand } from "./t3team-useCloudSessionListDemand";
import { useStableCallback } from "~/hooks/useStableCallback";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import { requestConfirmDialog } from "~/confirmDialog";

/**
 * Drives the cloud session surfaces (settings panel + "Run on" menu): create,
 * cancel/stop and connect. The panel owns a session's whole lifecycle; its
 * saved-backend row is a read-only connect target (`hasLiveCloudSession`).
 */
export function useCloudSessionController(options?: { readonly scopeKey?: string | null }) {
  const environmentId = usePrimaryEnvironmentId();
  const demand = useCloudSessionListDemand(options?.scopeKey ?? null);
  const {
    localSession,
    targetsNeedRefresh,
    queuedSendsPending,
    cloudMenuOpen,
    setCloudMenuOpen,
    hintCloudMenu,
    panelVisible,
    setPanelVisible,
  } = demand;
  const canManageRelay = useCanManageRelay();
  const cloudSessionsEnabled = useFeatureFlag("CLOUD_SESSIONS");
  /** Stop and delete are offered when the feature flag is on; the server enforces it too. */
  const stopDeleteEnabled = useFeatureFlag("CLOUD_SESSION_STOP_DELETE");
  const { environments: relayDiscovered } = useRelayEnvironmentDiscovery();
  const {
    sessions: serverSessions,
    loading,
    configured,
    historyUrl,
    loadError,
    refreshFailed,
    rateLimitedUntilMs,
  } = useCloudSessions(demand.listWanted);
  const [actionPending, setActionPending] = useState<{
    readonly sessionId: string;
    readonly kind: "cancel" | "stop" | "delete";
  } | null>(null);
  const [relayIdsBefore, setRelayIdsBefore] = useState<ReadonlySet<string> | null>(null);

  const sessions = useMemo(
    () => mergeLocalCloudSession(serverSessions, localSession),
    [serverSessions, localSession],
  );
  const provisioningVisible = sessions.some((session) =>
    isCloudSessionProvisionPending(session.phase),
  );
  const relayCandidates: RelayEnvironmentCandidate[] = useMemo(
    () =>
      [...relayDiscovered.values()].map((entry) => ({
        environmentId: entry.environment.environmentId,
        label: entry.environment.label,
      })),
    [relayDiscovered],
  );

  const cancelSession = useAtomCommand(cloudSessionEnvironment.cancel, { reportFailure: false });
  const deleteSession = useAtomCommand(cloudSessionEnvironment.delete, { reportFailure: false });
  const deleteSessionInfo = useAtomCommand(cloudSessionEnvironment.deleteInfo, {
    reportFailure: false,
  });
  const registerRelayEnvironment = useAtomCommand(environmentCatalog.register, {
    reportFailure: false,
  });
  // Keep listing while the menu/panel is open, while anything is still
  // provisioning (so a create survives thread navigation), or while a draft
  // has an optimistic create in flight or a first message queued for its session.
  const { refreshCloudSessionList, refreshRelayEnvironments } = useCloudSessionListRefresh(
    environmentId,
    cloudMenuOpen ||
      panelVisible ||
      provisioningVisible ||
      targetsNeedRefresh ||
      queuedSendsPending,
    sessions,
    rateLimitedUntilMs,
  );

  // A hint that starts the load counts as the refresh, so the menu's own open-time refresh is
  // not due for a gap; one that finds the list already asked for must not hold it off. One
  // identity, so the memoized "Run on" trigger does not re-render with this controller.
  const onCloudMenuHint = useStableCallback(() => {
    if (hintCloudMenu() && environmentId !== null) acquireCloudSessionListRefresh(environmentId);
  });

  const { connectPendingSessionId, connectFailure, requestConnect } = useCloudSessionConnect({
    sessions,
    relayCandidates,
    primaryEnvironmentId: environmentId,
    environmentIdsBefore: relayIdsBefore,
    register: registerRelayEnvironment,
  });
  // Stay loaded while the list still has work in flight after its surface closes. Set while
  // rendering, so the list never unsubscribes between the close and the latch.
  const listBusy = provisioningVisible || connectPendingSessionId !== null;
  if (listBusy !== demand.lingering) demand.setLingering(listBusy);

  const { onCreate, createPending, createPendingSetup } = useCloudSessionCreate({
    environmentId,
    canManageRelay,
    relayDiscovered,
    serverSessions,
    setRelayIdsBefore,
    setLocalSession: setCloudSessionLocal,
    refreshCloudSessionList,
  });

  const beginConnect = useCallback(
    (session: CloudSession) => {
      void refreshRelayEnvironments();
      requestConnect(session.sessionId);
    },
    [refreshRelayEnvironments, requestConnect],
  );

  const cancelRun = useCallback(
    (session: CloudSession, kind: "cancel" | "stop", successTitle: string) => {
      if (environmentId === null) return;
      setActionPending({ sessionId: session.sessionId, kind });
      void cancelSession({ environmentId, input: { sessionId: session.sessionId } })
        .then((result) => {
          if (result._tag === "Success") {
            toastManager.add({ type: kind === "stop" ? "success" : "info", title: successTitle });
            refreshCloudSessionList();
          } else {
            showCloudSessionFailureToast(
              `Could not ${kind === "stop" ? "stop" : "cancel"} that cloud session.`,
              result,
            );
          }
        })
        .finally(() => setActionPending(null));
    },
    [cancelSession, environmentId, refreshCloudSessionList],
  );

  const onSessionAction = useCallback(
    (session: CloudSession) => {
      if (session.phase === "ready") {
        beginConnect(session);
        return;
      }
      if (isTerminalCloudSessionPhase(session.phase)) {
        // "Start another": a fresh session at the remembered duration. The
        // record carries no requested hold (the runs API omits dispatch
        // inputs), so replaying the ended session's own is not possible.
        // A setup session offers none: its record carries no project either.
        if (session.machineSetup !== true) onCreate();
        return;
      }
      cancelRun(session, "cancel", "Cancelling that session…");
    },
    [beginConnect, cancelRun, onCreate],
  );

  const onSessionSecondaryAction = useCallback(
    (session: CloudSession) => {
      if (session.phase === "ready") cancelRun(session, "stop", "Stopping that cloud session.");
    },
    [cancelRun],
  );

  /**
   * Delete the machine's persistent state: one confirmation naming what will be lost,
   * then the server-side flow (stop, save unpushed work, remove the resume branch and the
   * snapshots). Progress and the result ride the row like the other session actions.
   */
  const onSessionDeleteAction = useCallback(
    async (session: CloudSession) => {
      if (environmentId === null) return;
      setActionPending({ sessionId: session.sessionId, kind: "delete" });
      try {
        const infoResult = await deleteSessionInfo({
          environmentId,
          input: { sessionId: session.sessionId },
        });
        if (infoResult._tag !== "Success") {
          showCloudSessionFailureToast(
            "Could not read what this machine would delete.",
            infoResult,
          );
          return;
        }
        const info = infoResult.value;
        const lines = [
          `The machine stops now. Its saved state is removed: threads on it stop, and the next session starts clean.`,
          ...(info.repository !== null ? [`Machine: ${info.repository}`] : []),
          ...(info.projects.length > 0
            ? [`Projects that use it on this device: ${info.projects.join(", ")}`]
            : []),
          "Unpushed work is saved to a wip/ branch on the project's remote first; if it cannot be, the delete is not done.",
        ];
        const confirmed =
          (await requestConfirmDialog(lines.join("\n"), { variant: "destructive" })) === true;
        if (!confirmed) return;
        const result = await deleteSession({
          environmentId,
          input: { sessionId: session.sessionId },
        });
        if (result._tag === "Success") {
          toastManager.add({
            type: "success",
            title:
              result.value.wipBranch !== null
                ? `Machine deleted. Unpushed work is saved on ${result.value.wipBranch}.`
                : "Machine deleted.",
          });
          refreshCloudSessionList();
        } else {
          showCloudSessionFailureToast("Could not delete that cloud machine.", result);
        }
      } finally {
        setActionPending((current) =>
          current?.sessionId === session.sessionId && current.kind === "delete" ? null : current,
        );
      }
    },
    [deleteSession, deleteSessionInfo, environmentId, refreshCloudSessionList],
  );

  const pendingSessionId = connectPendingSessionId ?? actionPending?.sessionId ?? null;
  const pendingKind: "connect" | "cancel" | "stop" | "delete" | null =
    connectPendingSessionId !== null ? "connect" : (actionPending?.kind ?? null);
  const pendingLabel =
    connectPendingSessionId !== null
      ? "Connecting…"
      : actionPending?.kind === "cancel"
        ? "Cancelling…"
        : actionPending?.kind === "delete"
          ? "Deleting…"
          : null;

  return {
    sessions,
    loading,
    loadError,
    refreshFailed,
    configured,
    historyUrl,
    createPending,
    createPendingSetup,
    pendingSessionId,
    pendingKind,
    pendingLabel,
    connectFailure,
    onCreate,
    onSessionAction,
    onSessionSecondaryAction,
    onSessionDeleteAction,
    stopDeleteEnabled,
    hasLiveCloudSession: useCallback(
      (machineEnvironmentId: EnvironmentId) =>
        liveCloudSessionForEnvironment(sessions, machineEnvironmentId) !== null,
      [sessions],
    ),
    onCloudMenuOpenChange: useCallback((open: boolean) => setCloudMenuOpen(open), []),
    onCloudMenuHint,
    onPanelVisibilityChange: useCallback((open: boolean) => setPanelVisible(open), []),
    // Starting a cloud session spends relay compute: without `relay:write` no entry offers it.
    // With `CLOUD_SESSIONS` off no entry offers one either; the server refuses a create then.
    available: environmentId !== null && canManageRelay && cloudSessionsEnabled,
    /** Where sessions are created; a project must live here to run in its machine. */
    primaryEnvironmentId: environmentId,
  };
}
