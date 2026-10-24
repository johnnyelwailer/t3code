import type { CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useEffect } from "react";

import {
  ENDED_SESSION_BANNER_COPY,
  resolveEndedSessionAction,
} from "~/cloud/t3team-endedSessionAction";
import { useCloudSessionController } from "~/cloud/t3team-useCloudSessionController";

import { Button } from "../ui/button";

/**
 * The ended-session banner's action, rendered from its inputs: which of the three states it is in
 * comes from `resolveEndedSessionAction`, the wording from `ENDED_SESSION_BANNER_COPY`, and the
 * click handlers are supplied by the caller. Presentational on purpose: the story and the tests
 * drive it with fixtures, so the restart/connect flow cannot fork into a look-alike.
 */
export function CloudSessionEndedActionsView({
  available,
  sessions,
  environmentId,
  createPending,
  onStart,
  onConnect,
}: {
  readonly available: boolean;
  readonly sessions: ReadonlyArray<CloudSession>;
  readonly environmentId: EnvironmentId;
  readonly createPending: boolean;
  readonly onStart: () => void;
  readonly onConnect: (session: CloudSession) => void;
}) {
  if (!available) return null;
  const action = resolveEndedSessionAction({ sessions, environmentId, createPending });
  if (action.kind === "starting") {
    return (
      <Button size="xs" variant="ghost" disabled>
        {ENDED_SESSION_BANNER_COPY.starting}
      </Button>
    );
  }
  if (action.kind === "connect") {
    return (
      <Button size="xs" variant="ghost" onClick={() => onConnect(action.session)}>
        {ENDED_SESSION_BANNER_COPY.connect}
      </Button>
    );
  }
  return (
    <Button size="xs" variant="ghost" onClick={onStart}>
      {ENDED_SESSION_BANNER_COPY.start}
    </Button>
  );
}

/**
 * The ended-session banner's action: start another cloud session in the original project, wait
 * for it, or connect to it. Mounted only while the environment's session is ended, so the session
 * list controller (and its polling) runs only then.
 *
 * `restartProjectId` is the primary-environment project the ended session's machine was built for:
 * passing it to `onCreate` restarts that project's machine (the same workspace and environment id),
 * instead of an unrelated plain session the banner could never connect to.
 */
export function CloudSessionEndedActions({
  environmentId,
  restartProjectId,
}: {
  readonly environmentId: EnvironmentId;
  readonly restartProjectId: ProjectId | null;
}) {
  const cloud = useCloudSessionController();
  const { onPanelVisibilityChange } = cloud;
  // Keep the session list fresh while the banner is showing: the new session's phase drives it.
  useEffect(() => {
    onPanelVisibilityChange(true);
    return () => onPanelVisibilityChange(false);
  }, [onPanelVisibilityChange]);

  return (
    <CloudSessionEndedActionsView
      available={cloud.available}
      sessions={cloud.sessions}
      environmentId={environmentId}
      createPending={cloud.createPending}
      onStart={() => cloud.onCreate(restartProjectId ?? undefined)}
      onConnect={(session) => cloud.onSessionAction(session)}
    />
  );
}
