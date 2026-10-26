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
import { setCloudSessionLocal } from "./t3team-cloudSessionLocalStore";
import { useCloudSessionListDemand } from "./t3team-useCloudSessionListDemand";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

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
    panelVisible,
    setPanelVisible,
  } = demand;
  const canManageRelay = useCanManageRelay();
  const cloudSessionsEnabled = useFeatureFlag("CLOUD_SESSIONS");
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
    readonly kind: "cancel" | "stop";
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

  const pendingSessionId = connectPendingSessionId ?? actionPending?.sessionId ?? null;
  const pendingKind: "connect" | "cancel" | "stop" | null =
    connectPendingSessionId !== null ? "connect" : (actionPending?.kind ?? null);
  const pendingLabel =
    connectPendingSessionId !== null
      ? "Connecting…"
      : actionPending?.kind === "cancel"
        ? "Cancelling…"
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
    hasLiveCloudSession: useCallback(
      (machineEnvironmentId: EnvironmentId) =>
        liveCloudSessionForEnvironment(sessions, machineEnvironmentId) !== null,
      [sessions],
    ),
    onCloudMenuOpenChange: useCallback((open: boolean) => setCloudMenuOpen(open), []),
    onPanelVisibilityChange: useCallback((open: boolean) => setPanelVisible(open), []),
    // Starting a cloud session spends relay compute: without `relay:write` no entry offers it.
    // With `CLOUD_SESSIONS` off no entry offers one either; the server refuses a create then.
    available: environmentId !== null && canManageRelay && cloudSessionsEnabled,
    /** Where sessions are created; a project must live here to run in its machine. */
    primaryEnvironmentId: environmentId,
  };
}
