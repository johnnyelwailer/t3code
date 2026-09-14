import {
  RelayConnectionRegistration,
  RelayConnectionTarget,
} from "@t3tools/client-runtime/connection";
import {
  isAtomCommandInterrupted,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  resolveCloudSessionEnvironment,
  type RelayEnvironmentCandidate,
} from "~/components/cloud/t3team-cloudSessionConnect";
import { toastManager } from "~/components/ui/toast";

type RegisterRelay = (
  registration: RelayConnectionRegistration,
) => Promise<AtomCommandResult<unknown, unknown>>;

/**
 * Resolves a ready cloud session to its relay environment and registers it —
 * the exact entry point a normal remote environment connects through
 * (`environmentCatalog.register` + a `RelayConnectionTarget`).
 *
 * A ready session's machine is a relay environment the client has not yet seen,
 * so resolution is deferred until relay discovery actually carries it. The
 * request is therefore kept as state and resolved *reactively*, which lets the
 * effect read the freshest discovery snapshot — and fire at most once, so a
 * poll that lands mid-registration cannot register the environment twice.
 */
export function useCloudSessionConnect(input: {
  sessions: readonly CloudSession[];
  relayCandidates: readonly RelayEnvironmentCandidate[];
  primaryEnvironmentId: EnvironmentId | null;
  environmentIdsBefore: ReadonlySet<string> | null;
  register: RegisterRelay;
}): {
  readonly connectPendingSessionId: string | null;
  readonly requestConnect: (sessionId: string) => void;
} {
  const { sessions, relayCandidates, primaryEnvironmentId, environmentIdsBefore, register } = input;
  const [connectRequestId, setConnectRequestId] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const firedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (connectRequestId === null) {
      firedForRef.current = null;
      return;
    }
    if (firedForRef.current === connectRequestId) return;
    const session = sessions.find((item) => item.sessionId === connectRequestId) ?? null;
    if (session === null || session.phase !== "ready") {
      setConnectRequestId(null);
      return;
    }
    const target = resolveCloudSessionEnvironment(session, {
      relayEnvironments: relayCandidates,
      primaryEnvironmentId,
      environmentIdsBefore,
    });
    if (target === null) {
      setConnectRequestId(null);
      toastManager.add({
        type: "info",
        title: "This session is ready — connect to it from your environment list.",
      });
      return;
    }
    firedForRef.current = connectRequestId;
    setRegistering(true);
    void register(
      new RelayConnectionRegistration({
        target: new RelayConnectionTarget({
          environmentId: target.environmentId,
          label: target.label,
        }),
      }),
    )
      .then((result) => {
        if (result._tag === "Success") {
          toastManager.add({ type: "success", title: `Connected to ${target.label}.` });
        } else if (!isAtomCommandInterrupted(result)) {
          toastManager.add({
            type: "error",
            title: "Could not connect to that cloud session.",
          });
        }
      })
      .finally(() => setRegistering(false));
  }, [
    connectRequestId,
    relayCandidates,
    sessions,
    primaryEnvironmentId,
    environmentIdsBefore,
    register,
  ]);

  const requestConnect = useCallback((sessionId: string) => {
    setConnectRequestId(sessionId);
  }, []);

  return {
    connectPendingSessionId: registering ? connectRequestId : null,
    requestConnect,
  };
}
