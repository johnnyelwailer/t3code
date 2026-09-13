import type { CloudSession } from "@t3tools/contracts";
import { useCallback, useState } from "react";

import {
  cloudSessionEnvironment,
  useCloudSessions,
  usePrimaryEnvironmentId,
} from "~/state/t3team-cloudSessions";
import { useAtomCommand } from "~/state/use-atom-command";
import { DEFAULT_CLOUD_SESSION_DURATION_SECONDS } from "~/components/cloud/t3team-CloudSessionProvisionPanel";
import { toastManager } from "~/components/ui/toast";

/**
 * Binds the cloud session surfaces to the server.
 *
 * One controller drives both entry points — the settings panel and the "Run on"
 * menu — so starting a session from either behaves identically and the two can
 * never drift.
 */
export function useCloudSessionController() {
  const environmentId = usePrimaryEnvironmentId();
  const { sessions, loading, configured } = useCloudSessions();
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_CLOUD_SESSION_DURATION_SECONDS);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  // `useAtomCommand` returns a bare command function with no pending state, so
  // the create-in-flight flag lives here; the panel and the "Run on" menu both
  // read it to keep the start button honest between dispatch and the atom's
  // next list refresh.
  const [createPending, setCreatePending] = useState(false);

  const createSession = useAtomCommand(cloudSessionEnvironment.create, { reportFailure: false });
  const cancelSession = useAtomCommand(cloudSessionEnvironment.cancel, { reportFailure: false });

  const onCreate = useCallback(
    (seconds: number) => {
      if (environmentId === null || createPending) return;
      setCreatePending(true);
      void createSession({ environmentId, input: { durationSeconds: seconds } })
        .then((result) => {
          if (result._tag === "Failure") {
            toastManager.add({
              type: "error",
              title: "Could not start a cloud session.",
            });
          }
        })
        .finally(() => setCreatePending(false));
    },
    [createPending, createSession, environmentId],
  );

  const onSessionAction = useCallback(
    (session: CloudSession) => {
      if (environmentId === null) return;

      // `ready` means the relay published the environment link, so the machine
      // is already in the connect list — the row's job is to point there, not
      // to open a second connection path.
      if (session.phase === "ready") {
        toastManager.add({
          type: "info",
          title: "This session is ready — connect to it from your environment list.",
        });
        return;
      }

      // A settled session has nothing left to cancel; the action restarts.
      if (session.phase === "failed" || session.phase === "stopped") {
        onCreate(durationSeconds);
        return;
      }

      setPendingSessionId(session.sessionId);
      void cancelSession({ environmentId, input: { sessionId: session.sessionId } })
        .then((result) => {
          if (result._tag === "Failure") {
            toastManager.add({
              type: "error",
              title: "Could not cancel that cloud session.",
            });
          }
        })
        .finally(() => setPendingSessionId(null));
    },
    [cancelSession, durationSeconds, environmentId, onCreate],
  );

  return {
    sessions,
    loading,
    configured,
    durationSeconds,
    onDurationChange: setDurationSeconds,
    createPending,
    pendingSessionId,
    onCreate,
    onSessionAction,
    /** Nothing can be started without an environment to start it from. */
    available: environmentId !== null,
  };
}
