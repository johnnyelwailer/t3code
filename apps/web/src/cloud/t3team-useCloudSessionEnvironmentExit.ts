import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import { useCallback, useState } from "react";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";
import { toastManager } from "~/components/ui/toast";

type CloudSessionCancelCommand = (input: {
  readonly environmentId: EnvironmentId;
  readonly input: { readonly sessionId: string };
}) => Promise<AtomCommandResult<unknown, unknown>>;

/**
 * The environment-exit affordance for the "Saved backends" cloud rows.
 *
 * Finding 1 correlates a ready session to the relay environment it bound to at
 * connect time; this hook keeps that link so a saved machine can be matched to
 * its live session again. "Stop this machine" ends the session through the same
 * server cancel/stop entry point the session panel uses. It is deliberately a
 * different verb from "Forget" (which is a local-only catalog removal that leaves
 * the remote machine running) — the two must stay separate.
 *
 * The link is held in React state (not a ref) so a freshly captured connection
 * re-renders the row and reveals the Stop affordance immediately. It is
 * session-scoped: across a reload the client cannot re-derive which saved relay
 * environment belongs to which live session (the server does not stamp the
 * environment id on the session record), so Stop is simply omitted then rather
 * than risk stopping the wrong machine.
 */
export function useCloudSessionEnvironmentExit(input: {
  readonly sessions: readonly CloudSession[];
  readonly environmentId: EnvironmentId | null;
  readonly cancelSession: CloudSessionCancelCommand;
  readonly refreshCloudSessionList: () => void;
  readonly refreshRelayEnvironments: () => void;
}): {
  readonly onRegistered: (sessionId: string, environmentId: EnvironmentId) => void;
  readonly stopEnvironment: (environmentId: EnvironmentId) => void;
  readonly hasLiveCloudSession: (environmentId: EnvironmentId) => boolean;
  readonly stoppingEnvironmentId: EnvironmentId | null;
} {
  const {
    sessions,
    environmentId,
    cancelSession,
    refreshCloudSessionList,
    refreshRelayEnvironments,
  } = input;
  // sessionId -> String(environmentId), captured the moment a session's machine
  // is registered (finding 1's connect flow).
  const [environmentBySessionId, setEnvironmentBySessionId] = useState(
    () => new Map<string, string>(),
  );
  const [stoppingEnvironmentId, setStoppingEnvironmentId] = useState<EnvironmentId | null>(null);

  const sessionIdFor = useCallback(
    (environmentId: EnvironmentId) => {
      const key = String(environmentId);
      for (const [sessionId, envKey] of environmentBySessionId) {
        if (envKey === key) return sessionId;
      }
      return null;
    },
    [environmentBySessionId],
  );

  const onRegistered = useCallback((sessionId: string, environmentId: EnvironmentId) => {
    setEnvironmentBySessionId((current) => new Map(current).set(sessionId, String(environmentId)));
  }, []);

  const stopEnvironment = useCallback(
    (environmentId: EnvironmentId) => {
      if (environmentId === null) return;
      const sessionId = sessionIdFor(environmentId);
      if (sessionId === null) return;
      const session = sessions.find((item) => item.sessionId === sessionId);
      if (session === undefined || isTerminalCloudSessionPhase(session.phase)) return;
      setStoppingEnvironmentId(environmentId);
      void cancelSession({ environmentId, input: { sessionId } })
        .then((result) => {
          if (result._tag === "Success") {
            toastManager.add({ type: "success", title: "Stopping that cloud session." });
            refreshCloudSessionList();
            void refreshRelayEnvironments();
          } else {
            toastManager.add({
              type: "error",
              title: "Could not stop that cloud session.",
            });
          }
        })
        .finally(() => setStoppingEnvironmentId(null));
    },
    [
      cancelSession,
      environmentId,
      refreshCloudSessionList,
      refreshRelayEnvironments,
      sessionIdFor,
      sessions,
    ],
  );

  const hasLiveCloudSession = useCallback(
    (environmentId: EnvironmentId) => {
      const sessionId = sessionIdFor(environmentId);
      if (sessionId === null) return false;
      const session = sessions.find((item) => item.sessionId === sessionId);
      return session !== undefined && !isTerminalCloudSessionPhase(session.phase);
    },
    [sessionIdFor, sessions],
  );

  return { onRegistered, stopEnvironment, hasLiveCloudSession, stoppingEnvironmentId };
}
