import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect } from "react";

import {
  ENDED_SESSION_BANNER_COPY,
  resolveEndedSessionAction,
} from "~/cloud/t3team-endedSessionAction";
import { useCloudSessionController } from "~/cloud/t3team-useCloudSessionController";

import { Button } from "../ui/button";

/**
 * The ended-session banner's action: start another cloud session, wait for it, or connect to it.
 * Mounted only while the environment's session is ended, so the session list controller (and its
 * polling) runs only then.
 */
export function CloudSessionEndedActions({
  environmentId,
}: {
  readonly environmentId: EnvironmentId;
}) {
  const cloud = useCloudSessionController();
  const { onPanelVisibilityChange } = cloud;
  // Keep the session list fresh while the banner is showing: the new session's phase drives it.
  useEffect(() => {
    onPanelVisibilityChange(true);
    return () => onPanelVisibilityChange(false);
  }, [onPanelVisibilityChange]);

  if (!cloud.available) return null;
  const action = resolveEndedSessionAction({
    sessions: cloud.sessions,
    environmentId,
    createPending: cloud.createPending,
  });
  if (action.kind === "starting") {
    return (
      <Button size="xs" variant="ghost" disabled>
        {ENDED_SESSION_BANNER_COPY.starting}
      </Button>
    );
  }
  if (action.kind === "connect") {
    return (
      <Button size="xs" variant="ghost" onClick={() => cloud.onSessionAction(action.session)}>
        {ENDED_SESSION_BANNER_COPY.connect}
      </Button>
    );
  }
  return (
    <Button size="xs" variant="ghost" onClick={() => cloud.onCreate()}>
      {ENDED_SESSION_BANNER_COPY.start}
    </Button>
  );
}
