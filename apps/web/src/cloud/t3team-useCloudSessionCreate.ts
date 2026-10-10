import type { CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LocalCloudSession } from "~/components/cloud/t3team-cloudSessionSplit";
import type { useRelayEnvironmentDiscovery } from "~/state/environments";
import { cloudSessionEnvironment } from "~/state/t3team-cloudSessions";
import { useAtomCommand } from "~/state/use-atom-command";

import { CLOUD_SESSION_LIFETIME_SECONDS } from "./t3team-cloudSessionLifetime";
import { reportCloudSessionCreateFailure } from "./t3team-cloudSessionFailure";

/**
 * Starting a cloud session: one create at a time, the new session shown locally until the server
 * list carries it. A create that needed a gh sign-in is repeated through the LATEST `onCreate`
 * (a ref), so the repeat respects whatever is pending by then instead of an old render's state.
 */
export function useCloudSessionCreate(input: {
  readonly environmentId: EnvironmentId | null;
  readonly relayDiscovered: ReturnType<typeof useRelayEnvironmentDiscovery>["environments"];
  readonly serverSessions: ReadonlyArray<CloudSession>;
  readonly setRelayIdsBefore: (ids: ReadonlySet<string>) => void;
  readonly setLocalSession: (session: LocalCloudSession) => void;
  readonly refreshCloudSessionList: () => void;
}) {
  const { environmentId, relayDiscovered, serverSessions } = input;
  const { setRelayIdsBefore, setLocalSession, refreshCloudSessionList } = input;
  const createSession = useAtomCommand(cloudSessionEnvironment.create, { reportFailure: false });
  const [pendingKind, setPendingKind] = useState<null | "session" | "setup">(null);
  const createPending = pendingKind !== null;
  const latestRef = useRef<
    (projectId?: ProjectId, options?: { readonly machineSetup?: boolean }) => void
  >(() => {});

  /** `projectId` (a project on the primary environment) runs the session in its machine. */
  const onCreate = useCallback(
    (projectId?: ProjectId, options?: { readonly machineSetup?: boolean }) => {
      if (environmentId === null || createPending) return;
      setRelayIdsBefore(
        new Set(
          [...relayDiscovered.values()].map((entry) => String(entry.environment.environmentId)),
        ),
      );
      setPendingKind(options?.machineSetup ? "setup" : "session");
      void createSession({
        environmentId,
        input: {
          durationSeconds: CLOUD_SESSION_LIFETIME_SECONDS,
          ...(projectId ? { projectId } : {}),
          ...(options?.machineSetup ? { machineSetup: true } : {}),
        },
      })
        .then((result) => {
          if (result._tag === "Success") {
            setLocalSession({
              session: result.value,
              knownServerSessionIds: new Set(serverSessions.map((session) => session.sessionId)),
            });
            refreshCloudSessionList();
          } else {
            reportCloudSessionCreateFailure(result, () => latestRef.current(projectId, options));
          }
        })
        .finally(() => setPendingKind(null));
    },
    [
      createPending,
      createSession,
      environmentId,
      refreshCloudSessionList,
      relayDiscovered,
      serverSessions,
      setLocalSession,
      setRelayIdsBefore,
    ],
  );
  useEffect(() => {
    latestRef.current = onCreate;
  }, [onCreate]);

  return { onCreate, createPending, createPendingSetup: pendingKind === "setup" };
}
