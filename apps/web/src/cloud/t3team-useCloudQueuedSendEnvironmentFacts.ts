import { useAtomValue } from "@effect/atom-react";
import type { CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { useMemo } from "react";

import { environmentAtomList, environmentIdsKey } from "~/state/environmentAtomList";
import { serverEnvironment } from "~/state/server";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { sessionEndedAtom } from "./t3team-useEnvironmentLiveState";

const welcomesAtom = environmentAtomList("t3team-queued-send-welcomes", (environmentId) =>
  serverEnvironment.welcome({ environmentId, input: {} }),
);
const sessionEndedListAtom = environmentAtomList("t3team-queued-send-ended", sessionEndedAtom);

/** The environments of the sessions the queued sends wait for, sorted so equal sets share atoms. */
export function queuedSendEnvironmentIds(
  queued: ReadonlyArray<CloudQueuedSend>,
  sessions: ReadonlyArray<Pick<CloudSession, "sessionId" | "environmentId">>,
): ReadonlyArray<EnvironmentId> {
  const ids = new Set<string>();
  for (const send of queued) {
    const environmentId = sessions.find((s) => s.sessionId === send.sessionId)?.environmentId;
    if (environmentId !== undefined) ids.add(environmentId);
  }
  return [...ids].sort() as EnvironmentId[];
}

/**
 * What each queued send's machine says about itself, for the flush decision: the project its
 * server's welcome names as its own (`bootstrapProjectId`), and whether its connection is parked
 * because the session ended. Per environment, so a machine that is not the primary one is read the
 * same way; the welcome atom opens that machine's lifecycle stream while a send waits on it.
 */
export function useCloudQueuedSendEnvironmentFacts(environmentIds: ReadonlyArray<EnvironmentId>): {
  readonly bootstrapProjectIdOf: (environmentId: EnvironmentId) => ProjectId | null;
  readonly sessionEndedOf: (environmentId: EnvironmentId) => boolean;
} {
  const key = environmentIdsKey(environmentIds);
  const welcomes = useAtomValue(welcomesAtom(key));
  const ended = useAtomValue(sessionEndedListAtom(key));
  return useMemo(() => {
    const ids = key === "" ? [] : key.split("\n");
    const projects = new Map<string, ProjectId>();
    const endedIds = new Set<string>();
    ids.forEach((id, index) => {
      const welcome = Option.getOrNull(AsyncResult.value(welcomes[index]!));
      if (welcome?.bootstrapProjectId !== undefined) projects.set(id, welcome.bootstrapProjectId);
      if (ended[index] === true) endedIds.add(id);
    });
    return {
      bootstrapProjectIdOf: (environmentId: EnvironmentId) => projects.get(environmentId) ?? null,
      sessionEndedOf: (environmentId: EnvironmentId) => endedIds.has(environmentId),
    };
  }, [ended, key, welcomes]);
}
