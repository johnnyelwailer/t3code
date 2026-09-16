import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import type { CloudSession } from "@t3tools/contracts";
import { CLOUD_SESSION_REFRESH_INTERVAL_MS } from "@t3tools/client-runtime/state/cloud-sessions";
import { useCallback, useMemo, useRef, useState } from "react";

import { environmentCatalog } from "~/connection/catalog";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import {
  cloudSessionEnvironment,
  useCloudSessions,
  usePrimaryEnvironmentId,
} from "~/state/t3team-cloudSessions";
import { useAtomCommand } from "~/state/use-atom-command";
import { relayEnvironmentDiscovery } from "~/state/relay";
import { useRelayEnvironmentDiscovery } from "~/state/environments";
import { DEFAULT_CLOUD_SESSION_DURATION_SECONDS } from "~/components/cloud/t3team-CloudSessionProvisionPanel";
import { toastManager } from "~/components/ui/toast";
import { type RelayEnvironmentCandidate } from "~/components/cloud/t3team-cloudSessionConnect";
import {
  isTerminalCloudSessionPhase,
  mergeLocalCloudSession,
  type LocalCloudSession,
} from "~/components/cloud/t3team-cloudSessionSplit";
import { useCloudSessionListPolling } from "./t3team-cloudSessionPolling";
import { showCloudSessionFailureToast } from "./t3team-cloudSessionToast";
import { useCloudSessionConnect } from "./t3team-useCloudSessionConnect";
import { useCloudSessionEnvironmentExit } from "./t3team-useCloudSessionEnvironmentExit";

/**
 * Drives the cloud session surfaces (settings panel + "Run on" menu). Create,
 * cancel/stop, connect, and the saved-machine "Stop" all exit via their hooks.
 */
export function useCloudSessionController() {
  const environmentId = usePrimaryEnvironmentId();
  const { environments: relayDiscovered } = useRelayEnvironmentDiscovery();
  const { sessions: serverSessions, loading, configured } = useCloudSessions();
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_CLOUD_SESSION_DURATION_SECONDS);
  const [createPending, setCreatePending] = useState(false);
  const [actionPending, setActionPending] = useState<{
    readonly sessionId: string;
    readonly kind: "cancel" | "stop";
  } | null>(null);
  const [localSession, setLocalSession] = useState<LocalCloudSession | null>(null);
  const relayIdsBeforeRef = useRef<ReadonlySet<string> | null>(null);
  const [cloudMenuOpen, setCloudMenuOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);

  const sessions = useMemo(
    () => mergeLocalCloudSession(serverSessions, localSession),
    [serverSessions, localSession],
  );
  const relayCandidates: RelayEnvironmentCandidate[] = useMemo(
    () =>
      [...relayDiscovered.values()].map((entry) => ({
        environmentId: entry.environment.environmentId,
        label: entry.environment.label,
      })),
    [relayDiscovered],
  );

  const createSession = useAtomCommand(cloudSessionEnvironment.create, { reportFailure: false });
  const cancelSession = useAtomCommand(cloudSessionEnvironment.cancel, { reportFailure: false });
  const registerRelayEnvironment = useAtomCommand(environmentCatalog.register, {
    reportFailure: false,
  });
  const refreshRelayEnvironments = useAtomCommand(relayEnvironmentDiscovery.refresh, {
    reportFailure: false,
  });
  const refreshCloudSessionList = useCallback(() => {
    if (environmentId === null) return;
    appAtomRegistry.refresh(cloudSessionEnvironment.list({ environmentId, input: {} }));
  }, [environmentId]);
  const pollTick = useCallback(() => {
    refreshCloudSessionList();
    void refreshRelayEnvironments();
  }, [refreshCloudSessionList, refreshRelayEnvironments]);
  useCloudSessionListPolling(
    pollTick,
    cloudMenuOpen || panelVisible,
    CLOUD_SESSION_REFRESH_INTERVAL_MS,
  );

  const exit = useCloudSessionEnvironmentExit({
    sessions,
    environmentId,
    cancelSession,
    refreshCloudSessionList,
    refreshRelayEnvironments,
  });

  const { connectPendingSessionId, requestConnect } = useCloudSessionConnect({
    sessions,
    relayCandidates,
    primaryEnvironmentId: environmentId,
    environmentIdsBefore: relayIdsBeforeRef.current,
    register: registerRelayEnvironment,
    onRegistered: exit.onRegistered,
  });

  const onCreate = useCallback(
    (seconds: number) => {
      if (environmentId === null || createPending) return;
      relayIdsBeforeRef.current = new Set(
        [...relayDiscovered.values()].map((entry) => String(entry.environment.environmentId)),
      );
      setCreatePending(true);
      void createSession({ environmentId, input: { durationSeconds: seconds } })
        .then((result) => {
          if (result._tag === "Success") {
            setLocalSession({
              session: result.value,
              knownServerSessionIds: new Set(serverSessions.map((session) => session.sessionId)),
            });
            refreshCloudSessionList();
          } else {
            showCloudSessionFailureToast("Could not start a cloud session.", result);
          }
        })
        .finally(() => setCreatePending(false));
    },
    [
      createPending,
      createSession,
      environmentId,
      refreshCloudSessionList,
      relayDiscovered,
      serverSessions,
    ],
  );

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
        onCreate(durationSeconds);
        return;
      }
      cancelRun(session, "cancel", "Cancelling that session…");
    },
    [beginConnect, cancelRun, durationSeconds, onCreate],
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
    configured,
    durationSeconds,
    onDurationChange: setDurationSeconds,
    createPending,
    pendingSessionId,
    pendingKind,
    pendingLabel,
    onCreate,
    onSessionAction,
    onSessionSecondaryAction,
    stopEnvironment: exit.stopEnvironment,
    hasLiveCloudSession: exit.hasLiveCloudSession,
    stoppingEnvironmentId: exit.stoppingEnvironmentId,
    onCloudMenuOpenChange: useCallback((open: boolean) => setCloudMenuOpen(open), []),
    onPanelVisibilityChange: useCallback((open: boolean) => setPanelVisible(open), []),
    available: environmentId !== null,
  };
}
