import { useAtomValue } from "@effect/atom-react";
import {
  CLOUD_SESSION_LIFETIME_SECONDS,
  CLOUD_SESSION_REFRESH_INTERVAL_MS,
  cloudSessionFailureDescription,
  isCloudSessionProvisionPending,
} from "@t3tools/client-runtime/state/cloud-sessions";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useEffect, useState } from "react";

import { appAtomRegistry } from "../../state/atom-registry";
import {
  cloudSessionEnvironment,
  cloudSessionListStateAtom,
  refreshCloudSessionList,
} from "../../state/t3team-cloudSessions";
import { useAtomCommand } from "../../state/use-atom-command";

/** Nothing is provisioning: phases only change when the user acts, which refreshes at once. */
const IDLE_REFRESH_INTERVAL_MS = 60_000;

/**
 * One environment's cloud sessions while the Machines screen shows them: polled at the desktop's
 * busy cadence while one provisions, started and cancelled one command at a time.
 */
export function useCloudSessionList(environmentId: EnvironmentId) {
  const list = useAtomValue(cloudSessionListStateAtom(environmentId));
  const createSession = useAtomCommand(cloudSessionEnvironment.create, { reportFailure: false });
  const cancelSession = useAtomCommand(cloudSessionEnvironment.cancel, { reportFailure: false });
  /** "create", or the id of the session being cancelled. */
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = useCallback(
    () => appAtomRegistry.refresh(refreshCloudSessionList(environmentId)),
    [environmentId],
  );
  const busy = list.sessions.some((session) => isCloudSessionProvisionPending(session.phase));
  useEffect(() => {
    const timer = setInterval(
      refresh,
      busy ? CLOUD_SESSION_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [busy, refresh]);

  const run = async (key: string, command: () => Promise<AtomCommandResult<unknown, unknown>>) => {
    setPending(key);
    setFailure(null);
    try {
      const result = await command();
      if (result._tag === "Success") refresh();
      else if (!isAtomCommandInterrupted(result)) {
        setFailure(cloudSessionFailureDescription(result));
      }
    } finally {
      setPending(null);
    }
  };
  const start = () =>
    run("create", () =>
      createSession({ environmentId, input: { durationSeconds: CLOUD_SESSION_LIFETIME_SECONDS } }),
    );
  const cancel = (sessionId: string) =>
    run(sessionId, () => cancelSession({ environmentId, input: { sessionId } }));

  return { list, pending, failure, refresh, start, cancel };
}
